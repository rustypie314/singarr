const express = require('express');
const axios = require('axios');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { syncPlexLibrary } = require('../services/plex');
const { getDb } = require('../db');

const router = express.Router();

// Image proxy — fetches Plex thumbnails server-side and pipes them to the browser
// Usage: /api/plex/thumb?path=/library/metadata/123/thumb/456
router.get('/thumb', requireAuth, async (req, res) => {
  const { path: thumbPath } = req.query;
  if (!thumbPath) return res.status(400).send('Missing path');

  try {
    const db = getDb();
    const plexUrl   = db.prepare("SELECT value FROM settings WHERE key = 'plex_url'").get()?.value
                   || process.env.PLEX_URL || '';
    const plexToken = db.prepare("SELECT value FROM settings WHERE key = 'plex_token'").get()?.value
                   || process.env.PLEX_TOKEN || '';

    if (!plexUrl || !plexToken) return res.status(503).send('Plex not configured');

    const url = `${plexUrl.replace(/\/$/, '')}${thumbPath}`;
    const response = await axios.get(url, {
      params: { 'X-Plex-Token': plexToken },
      responseType: 'stream',
      timeout: 8000,
    });

    // Cache for 7 days — thumbnails don't change often
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    response.data.pipe(res);
  } catch (e) {
    // Return a 204 so the browser doesn't show a broken image error in console
    res.status(204).send();
  }
});

// Trigger manual library sync
router.post('/sync', requireAdmin, async (req, res) => {
  try {
    await syncPlexLibrary();
    const db = getDb();
    const count = db.prepare('SELECT COUNT(*) as c FROM plex_library_cache').get().c;
    res.json({ success: true, itemsCached: count });
  } catch (e) {
    res.status(500).json({ error: 'Plex sync failed: ' + e.message });
  }
});

// Get library cache summary
router.get('/library', requireAuth, (req, res) => {
  const db = getDb();
  const artists  = db.prepare("SELECT COUNT(*) as c FROM plex_library_cache WHERE type = 'artist'").get().c;
  const albums   = db.prepare("SELECT COUNT(*) as c FROM plex_library_cache WHERE type = 'album'").get().c;
  const lastSync = db.prepare('SELECT MAX(synced_at) as t FROM plex_library_cache').get().t;
  res.json({ artists, albums, lastSync });
});

// Cover art proxy — fetches external cover images server-side to avoid CORS/hotlink issues
router.get('/cover', requireAuth, async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url');

  // Only allow known safe image domains
  const allowed = ['coverartarchive.org', 'archive.org', 'lastfm.freetls.fastly.net', 'fanart.tv', 'assets.fanart.tv'];
  let hostname;
  try { hostname = new URL(url).hostname; } catch { return res.status(400).send('Invalid url'); }
  if (!allowed.some(d => hostname.endsWith(d))) return res.status(403).send('Domain not allowed');

  try {
    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 8000,
      headers: { 'User-Agent': 'Singarr/1.0' },
    });
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    response.data.pipe(res);
  } catch {
    res.status(204).send();
  }
});

module.exports = router;
