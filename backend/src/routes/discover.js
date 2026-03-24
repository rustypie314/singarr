const express = require('express');
const axios = require('axios');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db');

const router = express.Router();

const MB_BASE = 'https://musicbrainz.org/ws/2';
const MB_HEADERS = { 'User-Agent': 'Singarr/1.0 (music-request-app)' };

async function getCoverArt(mbid) {
  try {
    const res = await axios.get(`https://coverartarchive.org/release-group/${mbid}`, { timeout: 4000 });
    return res.data?.images?.[0]?.thumbnails?.['250'] || res.data?.images?.[0]?.image || null;
  } catch { return null; }
}

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
    SELECT title, plex_rating_key, thumb, musicbrainz_id, genres FROM plex_library_cache
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

  // For downloaded requests, look up plex_rating_key from library cache
  const plexLookup = db.prepare(`
    SELECT plex_rating_key, quality FROM plex_library_cache
    WHERE type = 'album' AND LOWER(title) = LOWER(?) AND (? IS NULL OR ? = '' OR LOWER(artist_name) = LOWER(?))
    LIMIT 1
  `);
  const enrichedRequests = recentRequests.map(req => {
    if (req.status !== 'downloaded' || req.type !== 'album') return req;
    const plexItem = plexLookup.get(req.title, req.artist_name, req.artist_name, req.artist_name);
    return plexItem ? { ...req, plex_rating_key: plexItem.plex_rating_key, quality: plexItem.quality } : req;
  });

  const totalArtists = db.prepare("SELECT COUNT(*) as c FROM plex_library_cache WHERE type = 'artist'").get().c;
  const totalAlbums  = db.prepare("SELECT COUNT(*) as c FROM plex_library_cache WHERE type = 'album'").get().c;
  const lastSync     = db.prepare('SELECT MAX(synced_at) as t FROM plex_library_cache').get().t;

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

  return { artists, albums, recentRequests: enrichedRequests, stats: { totalArtists, totalAlbums, lastSync } };
}

// GET /api/discover
router.get('/', requireAuth, async (req, res) => {
  // plexConfig is always read fresh — never cached — so setting changes take effect immediately
  const db = getDb();
  const plexConfig = {
    machineId: db.prepare("SELECT value FROM settings WHERE key = 'plex_machine_id'").get()?.value || null,
    openMode:  db.prepare("SELECT value FROM settings WHERE key = 'plex_open_mode'").get()?.value || 'both',
    localUrl:  db.prepare("SELECT value FROM settings WHERE key = 'plex_url'").get()?.value || null,
  };

  // Try cache first — respond instantly if fresh
  const cached = readCache();
  if (cached) {
    res.json({ ...cached, plexConfig });
    // Refresh in background if cache is older than half the TTL
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
    res.json({ ...data, plexConfig });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load discover data' });
  }
});


// GET /api/discover/new-releases — recent releases from artists in your Plex library
router.get('/new-releases', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    // Get artists with MusicBrainz IDs from library
    const artists = db.prepare(`
      SELECT title, musicbrainz_id FROM plex_library_cache
      WHERE type = 'artist' AND musicbrainz_id IS NOT NULL
      ORDER BY RANDOM() LIMIT 30
    `).all();

    if (!artists.length) return res.json({ releases: [] });

    // Check last 12 months of releases for a sample of artists (batched to avoid rate limiting)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const cutoff = oneYearAgo.toISOString().substring(0, 10);

    const releases = [];
    for (const artist of artists.slice(0, 15)) {
      try {
        const res2 = await axios.get(`${MB_BASE}/release-group`, {
          params: { artist: artist.musicbrainz_id, limit: 5, fmt: 'json', type: 'album|ep|single' },
          headers: MB_HEADERS,
          timeout: 6000,
        });
        const groups = res2.data['release-groups'] || [];
        for (const g of groups) {
          const date = g['first-release-date'] || '';
          if (date >= cutoff) {
            const inPlex = db.prepare(
              `SELECT id FROM plex_library_cache WHERE type='album' AND LOWER(title)=LOWER(?)`
            ).get(g.title);
            releases.push({
              id: g.id,
              title: g.title,
              artistName: artist.title,
              year: date.substring(0, 4),
              month: date.substring(0, 7),
              type: g['primary-type'] || 'Album',
              coverUrl: null,
              inPlex: !!inPlex,
            });
          }
        }
      } catch {}
    }

    // Sort by date desc, deduplicate, limit 20
    const seen = new Set();
    const unique = releases
      .sort((a, b) => b.month.localeCompare(a.month))
      .filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
      .slice(0, 20);

    // Fetch cover art for results
    const withCovers = await Promise.all(unique.map(async r => {
      const cover = await getCoverArt(r.id).catch(() => null);
      return { ...r, coverUrl: cover };
    }));

    res.json({ releases: withCovers });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch new releases', releases: [] });
  }
});

// GET /api/discover/genres — top genres from library artists via Last.fm
router.get('/genres', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const artists = db.prepare(`
      SELECT genres FROM plex_library_cache
      WHERE type = 'artist' AND genres IS NOT NULL AND genres != ''
    `).all();

    const tagCounts = {};
    artists.forEach(a => {
      a.genres.split(',').forEach(g => {
        const name = g.trim();
        if (name.length > 2 && name.length < 30) tagCounts[name] = (tagCounts[name] || 0) + 1;
      });
    });

    const genres = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name]) => name.charAt(0).toUpperCase() + name.slice(1));

    res.json({ genres });
  } catch (e) {
    res.json({ genres: [] });
  }
});

// GET /api/discover/by-genre?genre=country — artists in library matching genre
router.get('/by-genre', requireAuth, (req, res) => {
  const { genre } = req.query;
  if (!genre) return res.json({ artists: [] });
  try {
    const db = getDb();
    const artists = db.prepare(`
      SELECT title, plex_rating_key, thumb, musicbrainz_id, genres FROM plex_library_cache
      WHERE type = 'artist' AND genres LIKE ?
      LIMIT 50
    `).all(`%${genre.toLowerCase()}%`);

    const result = artists.map(a => ({
      ...a,
      imageUrl: a.thumb ? `/api/plex/thumb?path=${encodeURIComponent(a.thumb)}` : null,
    }));
    res.json({ artists: result });
  } catch (e) {
    res.json({ artists: [] });
  }
});

module.exports = router;
