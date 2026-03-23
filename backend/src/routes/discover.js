const express = require('express');
const axios = require('axios');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db');

const router = express.Router();

const CACHE_KEY = 'discover_main';
const CACHE_TTL_MINUTES = 30;

function getApiKey(dbKey, envKey) {
  try {
    const db = getDb();
    return db.prepare(`SELECT value FROM settings WHERE key = ?`).get(dbKey)?.value
        || process.env[envKey] || null;
  } catch { return null; }
}

async function fanartArtistImage(mbid, apiKey) {
  if (!mbid || !apiKey) return null;
  try {
    const res = await axios.get(`https://webservice.fanart.tv/v3/music/${mbid}`, {
      params: { api_key: apiKey },
      timeout: 5000,
    });
    return res.data?.artistthumb?.[0]?.url
        || res.data?.artistbackground?.[0]?.url
        || null;
  } catch { return null; }
}

async function lastfmAlbumImage(albumTitle, artistName, apiKey) {
  try {
    const res = await axios.get('https://ws.audioscrobbler.com/2.0/', {
      params: { method: 'album.getinfo', album: albumTitle, artist: artistName, api_key: apiKey, format: 'json' },
      timeout: 5000,
    });
    const images = res.data?.album?.image || [];
    const img = images.find(i => i.size === 'extralarge')?.['#text']
             || images.find(i => i.size === 'large')?.['#text']
             || null;
    return img && !img.includes('2a96cbd8b46e442fc41c2b86b821562f') ? img : null;
  } catch { return null; }
}

function readCache() {
  try {
    const db = getDb();
    const row = db.prepare('SELECT data, fetched_at FROM discovery_cache WHERE key = ?').get(CACHE_KEY);
    if (!row) return null;
    const ageMinutes = (Date.now() - new Date(row.fetched_at).getTime()) / 60000;
    if (ageMinutes > CACHE_TTL_MINUTES) return null;
    return JSON.parse(row.data);
  } catch { return null; }
}

function writeCache(data) {
  try {
    const db = getDb();
    db.prepare('INSERT OR REPLACE INTO discovery_cache (key, data, fetched_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
      .run(CACHE_KEY, JSON.stringify(data));
  } catch {}
}

async function buildDiscoverData() {
  const db = getDb();
  const fanartKey = getApiKey('fanart_api_key', 'FANART_API_KEY');
  const lastfmKey = getApiKey('lastfm_api_key', 'LASTFM_API_KEY');

  const rawArtists = db.prepare(`
    SELECT title, plex_rating_key, thumb, musicbrainz_id FROM plex_library_cache
    WHERE type = 'artist' ORDER BY RANDOM() LIMIT 20
  `).all();

  const rawAlbums = db.prepare(`
    SELECT title, artist_name, plex_rating_key, thumb, quality FROM plex_library_cache
    WHERE type = 'album' ORDER BY RANDOM() LIMIT 20
  `).all();

  const recentRequests = db.prepare(`
    SELECT r.id, r.type, r.title, r.artist_name, r.cover_url, r.status, r.created_at,
           u.username, u.avatar
    FROM requests r
    JOIN users u ON r.user_id = u.id
    WHERE r.status != 'rejected'
    ORDER BY r.created_at DESC
    LIMIT 20
  `).all();

  const totalArtists = db.prepare("SELECT COUNT(*) as c FROM plex_library_cache WHERE type = 'artist'").get().c;
  const totalAlbums  = db.prepare("SELECT COUNT(*) as c FROM plex_library_cache WHERE type = 'album'").get().c;
  const lastSync     = db.prepare('SELECT MAX(synced_at) as t FROM plex_library_cache').get().t;

  const plexMachineId = db.prepare("SELECT value FROM settings WHERE key = 'plex_machine_id'").get()?.value || null;
  const plexOpenMode  = db.prepare("SELECT value FROM settings WHERE key = 'plex_open_mode'").get()?.value || 'both';
  const plexUrl       = db.prepare("SELECT value FROM settings WHERE key = 'plex_url'").get()?.value || null;

  // Artists: Fanart.tv > Plex thumb fallback
  const artistFanartImages = fanartKey
    ? await Promise.all(rawArtists.map(a => fanartArtistImage(a.musicbrainz_id, fanartKey)))
    : rawArtists.map(() => null);

  const artists = rawArtists.map((a, i) => ({
    ...a,
    imageUrl: artistFanartImages[i]
           || (a.thumb ? `/api/plex/thumb?path=${encodeURIComponent(a.thumb)}` : null),
  }));

  // Albums: Last.fm > Plex thumb fallback
  let albums = rawAlbums.map(a => ({
    ...a,
    imageUrl: a.thumb ? `/api/plex/thumb?path=${encodeURIComponent(a.thumb)}` : null,
  }));

  if (lastfmKey) {
    const albumImages = await Promise.all(
      rawAlbums.map(a => lastfmAlbumImage(a.title, a.artist_name, lastfmKey))
    );
    albums = rawAlbums.map((a, i) => ({
      ...a,
      imageUrl: albumImages[i] || (a.thumb ? `/api/plex/thumb?path=${encodeURIComponent(a.thumb)}` : null),
    }));
  }

  return {
    artists, albums, recentRequests,
    stats: { totalArtists, totalAlbums, lastSync },
    plexConfig: { machineId: plexMachineId, openMode: plexOpenMode, localUrl: plexUrl },
  };
}

// Track if a background refresh is already running
let refreshing = false;

// GET /api/discover
router.get('/', requireAuth, async (req, res) => {
  // Try cache first — respond instantly if fresh
  const cached = readCache();
  if (cached) {
    res.json(cached);
    // Refresh in background if cache is older than half the TTL
    const db = getDb();
    const row = db.prepare('SELECT fetched_at FROM discovery_cache WHERE key = ?').get(CACHE_KEY);
    const ageMinutes = row ? (Date.now() - new Date(row.fetched_at).getTime()) / 60000 : CACHE_TTL_MINUTES;
    if (ageMinutes > CACHE_TTL_MINUTES / 2 && !refreshing) {
      refreshing = true;
      buildDiscoverData()
        .then(writeCache)
        .catch(() => {})
        .finally(() => { refreshing = false; });
    }
    return;
  }

  // No cache — build fresh and respond
  try {
    const data = await buildDiscoverData();
    writeCache(data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load discover data' });
  }
});

module.exports = router;
