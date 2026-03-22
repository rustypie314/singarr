const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db');

const router = express.Router();

// GET /api/profile
router.get('/', requireAuth, (req, res) => {
  const { id, username, email, avatar, is_admin, genres, genres_set, request_limit_override, album_limit_override, track_limit_override, created_at } = req.user;
  let parsedGenres = [];
  try { parsedGenres = JSON.parse(genres || '[]'); } catch {}
  res.json({
    id, username, email, avatar,
    isAdmin: !!is_admin,
    genres: parsedGenres,
    genresSet: !!genres_set,
    requestLimitOverride: request_limit_override,
    albumLimitOverride: album_limit_override,
    trackLimitOverride: track_limit_override,
    createdAt: created_at,
  });
});

// PUT /api/profile/genres
router.put('/genres', requireAuth, (req, res) => {
  const { genres } = req.body;
  if (!Array.isArray(genres)) return res.status(400).json({ error: 'genres must be an array' });

  const db = getDb();
  db.prepare('UPDATE users SET genres = ?, genres_set = 1 WHERE id = ?')
    .run(JSON.stringify(genres), req.user.id);

  res.json({ success: true, genres });
});

module.exports = router;
