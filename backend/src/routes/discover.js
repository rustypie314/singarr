const express = require('express');
const axios = require('axios');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db');

const router = express.Router();

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

// Fetch album art from Last.fm
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

// GET /api/discover
router.get('/', requireAuth, async (req, res) => {
  const db = getDb();
  const fanartKey = getApiKey('fanart_api_key', 'FANART_API_KEY');
  const lastfmKey = getApiKey('lastfm_api_key', 'LASTFM_API_KEY');

  // Pull random samples from Plex cache
  const rawArtists = db.prepare(`
    SELECT title, plex_rating_key, thumb, musicbrainz_id FROM plex_library_cache
    WHERE type = 'artist' ORDER BY RANDOM() LIMIT 20
  `).all();

  const rawAlbums = db.prepare(`
    SELECT title, artist_name, plex_rating_key, thumb, quality FROM plex_library_cache
    WHERE type = 'album' ORDER BY RANDOM() LIMIT 20
  `).all();

  // Recent requests
  const recentRequests = db.prepare(`
    SELECT r.id, r.type, r.title, r.artist_name, r.cover_url, r.status, r.created_at,
           u.username, u.avatar
    FROM requests r
    JOIN users u ON r.user_id = u.id
    WHERE r.status != 'rejected'
    ORDER BY r.created_at DESC
    LIMIT 20
  `).all();

  // Library stats
  const totalArtists = db.prepare("SELECT COUNT(*) as c FROM plex_library_cache WHERE type = 'artist'").get().c;
  const totalAlbums  = db.prepare("SELECT COUNT(*) as c FROM plex_library_cache WHERE type = 'album'").get().c;
  const lastSync     = db.prepare('SELECT MAX(synced_at) as t FROM plex_library_cache').get().t;

  // Artists: Fanart.tv (best quality) > Plex thumb fallback
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

  res.json({
    artists,
    albums,
    recentRequests,
    stats: { totalArtists, totalAlbums, lastSync },
  });
});

module.exports = router;
