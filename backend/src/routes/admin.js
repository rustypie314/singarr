const express = require('express');
const { requireAdmin, requireAuth } = require('../middleware/auth');
const { getDb } = require('../db');

const router = express.Router();

// Get all settings
router.get('/settings', requireAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
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

  const update = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
  const updateMany = db.transaction((entries) => {
    for (const [key, value] of entries) {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        update.run(key, String(value));
        // Apply to process.env immediately so services pick it up without restart
        if (envMap[key]) process.env[envMap[key]] = String(value);
      }
    }
  });
  updateMany(Object.entries(settings));
  res.json({ success: true });
});

// Get all users
router.get('/users', requireAdmin, (req, res) => {
  const db = getDb();
  const users = db.prepare(`
    SELECT u.*, 
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
  if (isApproved !== undefined) { updates.push('is_approved = ?'); values.push(isApproved ? 1 : 0); }
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
  res.json({ success: true });
});

// Delete user
router.delete('/users/:id', requireAdmin, (req, res) => {
  const db = getDb();
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Update any request status (admin)
router.put('/requests/:id', requireAdmin, async (req, res) => {
  const db = getDb();
  const { status, notes } = req.body;
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Not found' });

  const validStatuses = ['pending', 'approved', 'found', 'downloading', 'downloaded', 'rejected', 'unavailable'];
  if (status && !validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const prevStatus = request.status;
  db.prepare('UPDATE requests SET status = COALESCE(?, status), notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(status || null, notes || null, req.params.id);

  // Send email notifications on status changes
  if (status && status !== prevStatus) {
    const requester = db.prepare('SELECT email FROM users WHERE id = ?').get(request.user_id);
    const userEmail = requester?.email;
    const { notifyRequestFulfilled, notifyRequestApproved, notifyRequestRejected } = require('../services/email');
    const appUrl = process.env.APP_URL || '';

    if (status === 'downloaded') {
      notifyRequestFulfilled(request, userEmail, appUrl).catch(() => {});
    } else if (status === 'approved' && prevStatus === 'pending') {
      notifyRequestApproved(request, userEmail, appUrl).catch(() => {});
    } else if (status === 'rejected') {
      notifyRequestRejected(request, userEmail, notes || '', appUrl).catch(() => {});
    }
  }

  res.json({ success: true });
});

// Get dashboard stats
router.get('/stats', requireAdmin, (req, res) => {
  const db = getDb();
  const totalRequests = db.prepare('SELECT COUNT(*) as c FROM requests').get().c;
  const pendingRequests = db.prepare("SELECT COUNT(*) as c FROM requests WHERE status = 'pending'").get().c;
  const downloadedRequests = db.prepare("SELECT COUNT(*) as c FROM requests WHERE status = 'downloaded'").get().c;
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const plexCacheCount = db.prepare('SELECT COUNT(*) as c FROM plex_library_cache').get().c;
  const recentRequests = db.prepare(`
    SELECT r.*, u.username FROM requests r JOIN users u ON r.user_id = u.id
    ORDER BY r.created_at DESC LIMIT 5
  `).all();
  res.json({ totalRequests, pendingRequests, downloadedRequests, totalUsers, plexCacheCount, recentRequests });
});

module.exports = router;

// Test email connection
router.post('/test-email', requireAdmin, async (req, res) => {
  const { testEmailConfig } = require('../services/email');
  const { host, port, secure, user, pass } = req.body;
  const result = await testEmailConfig({ host, port: parseInt(port || 587), secure: secure === 'true' || secure === true, user, pass });
  res.json(result);
});

// Send test email
router.post('/test-email/send', requireAdmin, async (req, res) => {
  const { getEmailConfig, createTransport } = require('../services/email');
  const { to, host, port, secure, user, pass, from, fromName } = req.body;
  if (!to) return res.status(400).json({ error: 'Recipient email required' });

  // Use posted values if provided, fall back to saved config
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
