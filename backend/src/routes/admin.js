const express = require('express');
const { requireAdmin, requireAuth } = require('../middleware/auth');
const { getDb } = require('../db');

const router = express.Router();
const { audit } = require('../services/audit');

// Get all settings — mask sensitive values
router.get('/settings', requireAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const SENSITIVE = new Set(['email_pass', 'plex_token', 'lidarr_api_key', 'lastfm_api_key', 'fanart_api_key', 'discogs_api_key']);
  const settings = {};
  rows.forEach(r => {
    settings[r.key] = SENSITIVE.has(r.key) && r.value ? '••••••••' : r.value;
  });
  res.json({ settings });
});

// Update settings (bulk)
router.put('/settings', requireAdmin, (req, res) => {
  const db = getDb();
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') return res.status(400).json({ error: 'settings object required' });

  // Keys that map to environment variables (applied immediately, no restart needed)
  const envMap = {
    lidarr_url:     'LIDARR_URL',
    lidarr_api_key: 'LIDARR_API_KEY',
    lastfm_api_key: 'LASTFM_API_KEY',
    fanart_api_key: 'FANART_API_KEY',
    plex_url:       'PLEX_URL',
    plex_token:     'PLEX_TOKEN',
  };

  const SENSITIVE = new Set(['email_pass', 'plex_token', 'lidarr_api_key', 'lastfm_api_key', 'fanart_api_key', 'discogs_api_key']);
  const update = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
  const updateMany = db.transaction((entries) => {
    for (const [key, value] of entries) {
      if (value === undefined || value === null || String(value).trim() === '') continue;
      // Skip masked placeholder — user didn't change this sensitive field
      if (SENSITIVE.has(key) && String(value) === '••••••••') continue;
      update.run(key, String(value));
      if (envMap[key]) process.env[envMap[key]] = String(value);
    }
  });
  updateMany(Object.entries(settings));
  audit({ userId: req.user.id, username: req.user.username, category: 'settings', action: 'Saved settings' });
  res.json({ success: true });
});

// Get all users
router.get('/users', requireAdmin, (req, res) => {
  const db = getDb();
  const users = db.prepare(`
    SELECT u.id, u.plex_id, u.username, u.display_name, u.email, u.avatar,
      u.is_admin, u.is_local_admin, u.is_approved, u.request_limit_override,
      u.album_limit_override, u.track_limit_override, u.created_at, u.last_login,
      (SELECT COUNT(*) FROM requests r WHERE r.user_id = u.id) as total_requests
    FROM users u ORDER BY u.created_at DESC
  `).all();
  res.json({ users });
});

// Update user (approve, admin toggle, limit override)
router.put('/users/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const { isApproved, isAdmin, requestLimitOverride, albumLimitOverride, trackLimitOverride } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const updates = [];
  const values = [];
  if (isApproved !== undefined) {
    // Once approved, a user cannot be un-approved — remove them instead
    if (!isApproved && user.is_approved) {
      return res.status(400).json({ error: 'Approved users cannot be un-approved. Remove the user instead.' });
    }
    updates.push('is_approved = ?'); values.push(isApproved ? 1 : 0);
  }
  if (isAdmin !== undefined) { updates.push('is_admin = ?'); values.push(isAdmin ? 1 : 0); }
  if (requestLimitOverride !== undefined) {
    updates.push('request_limit_override = ?');
    values.push(requestLimitOverride === null ? null : parseInt(requestLimitOverride));
  }
  if (albumLimitOverride !== undefined) {
    updates.push('album_limit_override = ?');
    values.push(albumLimitOverride === null ? null : parseInt(albumLimitOverride));
  }
  if (trackLimitOverride !== undefined) {
    updates.push('track_limit_override = ?');
    values.push(trackLimitOverride === null ? null : parseInt(trackLimitOverride));
  }

  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  values.push(req.params.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  // Audit log meaningful user changes
  if (isApproved !== undefined) audit({ userId: req.user.id, username: req.user.username, category: 'user', action: isApproved ? 'Approved user' : 'Unapproved user', detail: user.username });
  if (isAdmin !== undefined) audit({ userId: req.user.id, username: req.user.username, category: 'user', action: isAdmin ? 'Promoted to admin' : 'Demoted from admin', detail: user.username });

  res.json({ success: true });
});

// Delete user
router.delete('/users/:id', requireAdmin, (req, res) => {
  const db = getDb();
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  const delUser = db.prepare('SELECT username FROM users WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  if (delUser) audit({ userId: req.user.id, username: req.user.username, category: 'user', action: 'Deleted user', detail: delUser.username });
  res.json({ success: true });
});

// Update any request status (admin)

// Approve or reject a request
router.put('/requests/:id', requireAdmin, async (req, res) => {
  const db = getDb();
  const { status } = req.body;
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Not found' });
  const validStatuses = ['pending', 'approved', 'found', 'downloading', 'downloaded', 'rejected', 'unavailable'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const prevStatus = request.status;
  db.prepare('UPDATE requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
  // Send email notifications on status changes
  if (status !== prevStatus) {
    const requester = db.prepare('SELECT email FROM users WHERE id = ?').get(request.user_id);
    const { notifyRequestApproved, notifyRequestRejected } = require('../services/email');
    const appUrl = process.env.APP_URL || '';
    if (status === 'approved' && prevStatus === 'pending') {
      notifyRequestApproved(request, requester?.email, appUrl).catch(() => {});
    } else if (status === 'rejected') {
      notifyRequestRejected(request, requester?.email, '', appUrl).catch(() => {});
    }
  }
  res.json({ success: true });
});

router.get('/stats', requireAdmin, (req, res) => {
  const db = getDb();
  const totalRequests = db.prepare('SELECT COUNT(*) as c FROM requests').get().c;
  const pendingRequests = db.prepare("SELECT COUNT(*) as c FROM requests WHERE status = 'pending'").get().c;
  const downloadedRequests = db.prepare("SELECT COUNT(*) as c FROM requests WHERE status = 'downloaded'").get().c;
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const plexCacheCount = db.prepare('SELECT COUNT(*) as c FROM plex_library_cache').get().c;
  const recentRequests = db.prepare(`
    SELECT r.*, u.username FROM requests r JOIN users u ON r.user_id = u.id
    ORDER BY r.created_at DESC LIMIT 50
  `).all();

  // Analytics data
  const requestsByDay = db.prepare(`
    SELECT DATE(created_at) as day, COUNT(*) as count
    FROM requests
    WHERE created_at >= DATE('now', '-30 days')
    GROUP BY DATE(created_at)
    ORDER BY day ASC
  `).all();

  const requestsByType = db.prepare(`
    SELECT type, COUNT(*) as count FROM requests GROUP BY type
  `).all();

  const requestsByStatus = db.prepare(`
    SELECT status, COUNT(*) as count FROM requests GROUP BY status
  `).all();

  const topRequesters = db.prepare(`
    SELECT u.username, u.avatar, COUNT(r.id) as count
    FROM requests r JOIN users u ON r.user_id = u.id
    GROUP BY r.user_id ORDER BY count DESC LIMIT 5
  `).all();

  const topArtists = db.prepare(`
    SELECT artist_name, COUNT(*) as count
    FROM requests
    WHERE artist_name IS NOT NULL AND artist_name != ''
    GROUP BY LOWER(artist_name)
    ORDER BY count DESC LIMIT 5
  `).all();

  const avgPerDay = db.prepare(`
    SELECT ROUND(COUNT(*) * 1.0 / MAX(1, JULIANDAY('now') - JULIANDAY(MIN(created_at))), 1) as avg
    FROM requests
  `).get().avg || 0;

  res.json({
    totalRequests, pendingRequests, downloadedRequests, totalUsers, plexCacheCount, recentRequests,
    analytics: { requestsByDay, requestsByType, requestsByStatus, topRequesters, topArtists, avgPerDay },
  });
});

// GET /admin/audit — full audit log (admin) or own activity (user)
router.get('/audit', requireAuth, (req, res) => {
  const db = getDb();
  const { category, limit = 100 } = req.query;
  let query, params;
  if (req.user.is_admin) {
    query = category && category !== 'all'
      ? 'SELECT * FROM audit_log WHERE category = ? ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?';
    params = category && category !== 'all' ? [category, Number(limit)] : [Number(limit)];
  } else {
    query = category && category !== 'all'
      ? 'SELECT * FROM audit_log WHERE user_id = ? AND category = ? ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?';
    params = category && category !== 'all'
      ? [req.user.id, category, Number(limit)]
      : [req.user.id, Number(limit)];
  }
  const logs = db.prepare(query).all(...params);
  res.json({ logs });
});

module.exports = router;

// Test email connection
router.post('/test-email', requireAdmin, async (req, res) => {
  const { testEmailConfig } = require('../services/email');
  const db = getDb();
  const MASK = '••••••••';
  const { host, port, secure, user } = req.body;
  const pass = req.body.pass === MASK
    ? db.prepare("SELECT value FROM settings WHERE key = 'email_pass'").get()?.value
    : req.body.pass;
  const result = await testEmailConfig({ host, port: parseInt(port || 587), secure: secure === 'true' || secure === true, user, pass });
  res.json(result);
});

// Send test email
router.post('/test-email/send', requireAdmin, async (req, res) => {
  const { getEmailConfig, createTransport } = require('../services/email');
  const db = getDb();
  const MASK = '••••••••';
  const { to, host, port, secure, user, from, fromName } = req.body;
  const pass = req.body.pass === MASK
    ? db.prepare("SELECT value FROM settings WHERE key = 'email_pass'").get()?.value
    : req.body.pass;
  if (!to) return res.status(400).json({ error: 'Recipient email required' });

  const saved = getEmailConfig();
  const config = {
    host:     host     || saved.host,
    port:     parseInt(port || saved.port || 587),
    secure:   secure !== undefined ? (secure === 'true' || secure === true) : saved.secure,
    user:     user     || saved.user,
    pass:     pass     || saved.pass,
    from:     from     || saved.from,
    fromName: fromName || saved.fromName || 'Singarr',
  };

  if (!config.host) return res.status(400).json({ ok: false, error: 'SMTP host not configured' });

  try {
    const transport = createTransport(config);
    const info = await transport.sendMail({
      from: `"${config.fromName}" <${config.from || config.user}>`,
      to,
      subject: 'Singarr — Test email',
      html: `<div style="font-family:sans-serif;padding:20px;background:#0a0a0b;color:#f0f0f2;border-radius:12px;">
        <h2 style="color:#2dbe6c;">✓ Email is working!</h2>
        <p>Your Singarr email notifications are configured correctly.</p>
      </div>`,
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[Email] Test send failed:', e.message);
    res.json({ ok: false, error: e.message });
  }
});
