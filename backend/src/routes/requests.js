const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { checkRequestLimit, checkTypeAllowed } = require('../services/limits');
const { addArtistToLidarr, addAlbumToLidarr } = require('../services/lidarr');
const { isInPlexLibrary } = require('../services/plex');
const { getDb } = require('../db');
const { notifyRequestFulfilled, notifyRequestApproved, notifyRequestRejected, notifyAdminNewRequest } = require('../services/email');

const router = express.Router();

function getAppUrl() {
  return process.env.APP_URL || '';
}

// Get my requests
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const requests = db.prepare(`
    SELECT r.*, u.username, u.avatar FROM requests r
    JOIN users u ON r.user_id = u.id
    WHERE r.user_id = ?
    ORDER BY r.created_at DESC
  `).all(req.user.id);
  res.json({ requests });
});

// Get all requests (admin sees all, users see own)
router.get('/all', requireAuth, (req, res) => {
  const db = getDb();
  let requests;
  if (req.user.is_admin) {
    requests = db.prepare(`
      SELECT r.*, u.username, u.avatar FROM requests r
      JOIN users u ON r.user_id = u.id
      ORDER BY r.created_at DESC
      LIMIT 200
    `).all();
  } else {
    requests = db.prepare(`
      SELECT r.*, u.username, u.avatar FROM requests r
      JOIN users u ON r.user_id = u.id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC
    `).all(req.user.id);
  }

  // Cross-reference downloaded album requests with plex_library_cache
  const plexExact = db.prepare(`
    SELECT plex_rating_key, quality FROM plex_library_cache
    WHERE type = 'album' AND LOWER(title) = LOWER(?) AND (? IS NULL OR ? = '' OR LOWER(artist_name) = LOWER(?))
    LIMIT 1
  `);
  const plexFuzzy = db.prepare(`
    SELECT plex_rating_key, quality FROM plex_library_cache
    WHERE type = 'album' AND (? IS NULL OR ? = '' OR LOWER(artist_name) = LOWER(?))
    AND LOWER(title) LIKE LOWER(?) || '%'
    LIMIT 1
  `);
  const enriched = requests.map(r => {
    if (r.status !== 'downloaded' || r.type !== 'album') return r;
    const plexItem = plexExact.get(r.title, r.artist_name, r.artist_name, r.artist_name)
                  || plexFuzzy.get(r.artist_name, r.artist_name, r.artist_name, r.title.split(':')[0].split('(')[0].trim());
    return plexItem ? { ...r, plex_rating_key: plexItem.plex_rating_key, quality: plexItem.quality } : r;
  });

  const plexConfig = {
    machineId: db.prepare("SELECT value FROM settings WHERE key = 'plex_machine_id'").get()?.value || null,
    openMode:  db.prepare("SELECT value FROM settings WHERE key = 'plex_open_mode'").get()?.value || 'both',
    localUrl:  db.prepare("SELECT value FROM settings WHERE key = 'plex_url'").get()?.value || null,
  };

  res.json({ requests: enriched, plexConfig });
});

// Get request settings needed by frontend (approval status) — no sensitive data
router.get('/settings', requireAuth, (req, res) => {
  const db = getDb();
  const requireApproval = db.prepare("SELECT value FROM settings WHERE key = 'require_approval'").get()?.value || 'false';
  const autoApprovePlexUsers = db.prepare("SELECT value FROM settings WHERE key = 'auto_approve_plex_users'").get()?.value || 'false';
  res.json({ requireApproval, autoApprovePlexUsers });
});

// Get request limit status for current user
router.get('/limits', requireAuth, (req, res) => {
  const album = checkRequestLimit(req.user, 'album');
  const track = checkRequestLimit(req.user, 'track');
  res.json({ album, track });
});

// Create a request
router.post('/', requireAuth, async (req, res) => {
  const { type, musicbrainzId, title, artistName, coverUrl } = req.body;

  if (!type || !title) return res.status(400).json({ error: 'type and title are required' });
  if (!['artist', 'album', 'track'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  if (title.length > 500) return res.status(400).json({ error: 'Title too long' });
  if (artistName && artistName.length > 500) return res.status(400).json({ error: 'Artist name too long' });

  // Check if type is allowed
  if (!checkTypeAllowed(type)) {
    return res.status(403).json({ error: `${type} requests are currently disabled` });
  }

  // Check Plex library
  if (isInPlexLibrary(title, artistName, type)) {
    return res.status(409).json({ error: 'This item is already in your Plex library', inPlex: true });
  }

  // Check rate limit
  const limitInfo = checkRequestLimit(req.user, type);
  if (!limitInfo.allowed) {
    return res.status(429).json({
      error: `${type} request limit reached. You've used ${limitInfo.used}/${limitInfo.limit} in the past ${limitInfo.days} days.`,
      limitInfo,
    });
  }

  // Check for duplicate request
  const db = getDb();
  const existing = musicbrainzId
    ? db.prepare('SELECT * FROM requests WHERE musicbrainz_id = ? AND type = ? AND status != ?').get(musicbrainzId, type, 'rejected')
    : db.prepare('SELECT * FROM requests WHERE LOWER(title) = LOWER(?) AND type = ? AND status != ?').get(title, type, 'rejected');

  if (existing) {
    return res.status(409).json({
      error: 'This has already been requested',
      existingRequest: existing,
    });
  }

  const db2 = getDb();
  const requireApproval = db2.prepare("SELECT value FROM settings WHERE key = 'require_approval'").get();
  const needsApproval = requireApproval?.value === 'true' && !req.user.is_admin;

  // Insert request
  const result = db.prepare(`
    INSERT INTO requests (user_id, type, musicbrainz_id, title, artist_name, cover_url, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, type, musicbrainzId || null, title, artistName || null, coverUrl || null, needsApproval ? 'pending' : 'approved');

  const requestId = result.lastInsertRowid;
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);

  // If auto-approved, send to Lidarr
  if (!needsApproval) {
    sendToLidarr(requestId, type, musicbrainzId, title, artistName).catch(e => {
      console.error(`Failed to send request ${requestId} to Lidarr:`, e.message);
    });
  }

  // Email admin about new request
  const admins = db.prepare("SELECT email FROM users WHERE is_admin = 1 AND email IS NOT NULL AND email != ''").all();
  for (const admin of admins) {
    notifyAdminNewRequest(request, req.user.username, admin.email, getAppUrl()).catch(() => {});
  }

  res.status(201).json({ request });
});

async function sendToLidarr(requestId, type, musicbrainzId, title, artistName) {
  const db = getDb();
  try {
    let lidarrId = null;
    if (type === 'artist' && musicbrainzId) {
      const artist = await addArtistToLidarr(musicbrainzId, title);
      lidarrId = artist?.id;
    } else if (type === 'album' && musicbrainzId) {
      const album = await addAlbumToLidarr(musicbrainzId);
      lidarrId = album?.artistId;
    }
    db.prepare('UPDATE requests SET lidarr_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(lidarrId, 'found', requestId);
  } catch (e) {
    const detail = e.response?.data ? JSON.stringify(e.response.data) : e.message;
    console.error(`Lidarr submission failed for request ${requestId}: ${detail}`);
    db.prepare('UPDATE requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run('unavailable', requestId);
  }
}

// Delete a request (own requests or admin)
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Not found' });
  if (!req.user.is_admin && request.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM requests WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
