const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');
const { audit } = require('../services/audit');

const router = express.Router();
const PLEX_CLIENT_ID = process.env.PLEX_CLIENT_ID || 'singarr';
const PLEX_PRODUCT = 'Singarr';

// ── Local admin login ─────────────────────────────────────
router.post('/local', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const db = getDb();
  const user = db.prepare(
    'SELECT * FROM users WHERE local_username = ? AND local_password_hash IS NOT NULL'
  ).get(username.trim());

  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const valid = await bcrypt.compare(password, user.local_password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  if (!user.is_approved) {
    return res.status(403).json({ error: 'Account is not approved' });
  }

  db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  audit({ userId: user.id, username: user.username, category: 'auth', action: 'Admin login' });

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      isAdmin: !!user.is_admin,
      isLocalAdmin: !!user.is_local_admin,
    }
  });
});

// ── Plex OAuth: Step 1 — get PIN ─────────────────────────
router.post('/plex/pin', async (req, res) => {
  try {
    const response = await axios.post('https://plex.tv/api/v2/pins', {
      strong: true,
      'X-Plex-Product': PLEX_PRODUCT,
      'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
    }, {
      headers: {
        'Accept': 'application/json',
        'X-Plex-Product': PLEX_PRODUCT,
        'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
      }
    });
    res.json({ id: response.data.id, code: response.data.code });
  } catch (e) {
    console.error('Plex PIN error:', e.message);
    res.status(500).json({ error: 'Failed to get Plex PIN' });
  }
});

// ── Plex OAuth: Step 2 — poll PIN ────────────────────────
router.get('/plex/pin/:pinId', async (req, res) => {
  try {
    const response = await axios.get(`https://plex.tv/api/v2/pins/${req.params.pinId}`, {
      headers: {
        'Accept': 'application/json',
        'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
      }
    });

    const pin = response.data;
    if (!pin.authToken) return res.json({ authenticated: false });

    const userResponse = await axios.get('https://plex.tv/api/v2/user', {
      headers: {
        'Accept': 'application/json',
        'X-Plex-Token': pin.authToken,
        'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
      }
    });

    const plexUser = userResponse.data;
    const db = getDb();

    const autoApprove = db.prepare("SELECT value FROM settings WHERE key = 'auto_approve_plex_users'").get();
    const shouldApprove = autoApprove?.value === 'true';

    const existing = db.prepare('SELECT * FROM users WHERE plex_id = ?').get(String(plexUser.id));
    let userId;

    if (existing) {
      db.prepare(`
        UPDATE users SET username = ?, email = ?, avatar = ?, last_login = CURRENT_TIMESTAMP
        WHERE plex_id = ?
      `).run(plexUser.username, plexUser.email, plexUser.thumb, String(plexUser.id));
      userId = existing.id;
    } else {
      const result = db.prepare(`
        INSERT INTO users (plex_id, username, email, avatar, is_admin, is_approved)
        VALUES (?, ?, ?, ?, 0, ?)
      `).run(String(plexUser.id), plexUser.username, plexUser.email, plexUser.thumb, shouldApprove ? 1 : 0);
      userId = result.lastInsertRowid;
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user.is_approved) {
      return res.json({ authenticated: true, approved: false });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({
      authenticated: true,
      approved: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        isAdmin: !!user.is_admin,
        isLocalAdmin: !!user.is_local_admin,
      }
    });
  } catch (e) {
    console.error('Plex PIN poll error:', e.message);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// ── Get current user ──────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const { id, username, display_name, email, avatar, is_admin, is_local_admin, request_limit_override, album_limit_override, track_limit_override, created_at } = req.user;
  res.json({
    id,
    username,
    displayName: display_name || null,
    email,
    avatar,
    isAdmin: !!is_admin,
    isLocalAdmin: !!is_local_admin,
    requestLimitOverride: request_limit_override,
    albumLimitOverride: album_limit_override,
    trackLimitOverride: track_limit_override,
    createdAt: created_at,
  });
});

// ── Change local admin password (admin only) ──────────────
router.post('/local/change-password', requireAuth, async (req, res) => {
  if (!req.user.is_local_admin && !req.user.is_admin) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user.local_password_hash) {
    return res.status(400).json({ error: 'No local password set for this account' });
  }

  const valid = await bcrypt.compare(currentPassword, user.local_password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  const hash = await bcrypt.hash(newPassword, 12);
  db.prepare('UPDATE users SET local_password_hash = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ success: true });
});

router.post('/local/change-display-name', requireAuth, (req, res) => {
  if (!req.user.is_local_admin) return res.status(403).json({ error: 'Not authorized' });
  const { displayName } = req.body;
  const trimmed = (displayName || '').trim();
  if (trimmed.length > 50) return res.status(400).json({ error: 'Display name must be 50 characters or fewer' });
  const db = getDb();
  // Store null if empty (falls back to username in UI)
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(trimmed || null, req.user.id);
  res.json({ success: true, displayName: trimmed || null });
});

module.exports = router;
