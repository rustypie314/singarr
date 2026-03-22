const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getDb } = require('../db');
const { notifyAdminNewIssue, notifyIssueStatusChanged, notifyIssueNoteAdded } = require('../services/email');

const router = express.Router();

const ISSUE_TYPES = {
  missing_tracks: 'Missing Tracks',
  poor_quality:   'Poor Audio Quality',
  other:          'Other',
};

// Get issues (users see own, admin sees all)
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  let issues;
  if (req.user.is_admin) {
    issues = db.prepare(`
      SELECT i.*, u.username, u.avatar,
        r.title as request_title, r.cover_url as request_cover
      FROM issues i
      JOIN users u ON i.user_id = u.id
      LEFT JOIN requests r ON i.request_id = r.id
      ORDER BY i.created_at DESC
    `).all();
  } else {
    issues = db.prepare(`
      SELECT i.*, u.username, u.avatar,
        r.title as request_title, r.cover_url as request_cover
      FROM issues i
      JOIN users u ON i.user_id = u.id
      LEFT JOIN requests r ON i.request_id = r.id
      WHERE i.user_id = ?
      ORDER BY i.created_at DESC
    `).all(req.user.id);
  }
  res.json({ issues });
});

// Get issue counts (for badge)
router.get('/counts', requireAuth, (req, res) => {
  const db = getDb();
  const open = req.user.is_admin
    ? db.prepare("SELECT COUNT(*) as c FROM issues WHERE status = 'open'").get().c
    : db.prepare("SELECT COUNT(*) as c FROM issues WHERE status = 'open' AND user_id = ?").get(req.user.id).c;
  res.json({ open });
});

// Create issue
router.post('/', requireAuth, (req, res) => {
  const { type, title, description, requestId } = req.body;
  if (!type || !title) return res.status(400).json({ error: 'type and title are required' });
  if (!ISSUE_TYPES[type]) return res.status(400).json({ error: 'Invalid issue type' });

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO issues (user_id, request_id, type, title, description)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, requestId || null, type, title.trim(), description?.trim() || null);

  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(result.lastInsertRowid);

  // Notify admin
  const admin = db.prepare('SELECT email FROM users WHERE is_local_admin = 1 OR is_admin = 1 ORDER BY is_local_admin DESC LIMIT 1').get();
  const appUrl = db.prepare("SELECT value FROM settings WHERE key = 'app_url'").get()?.value || '';
  if (admin?.email) {
    notifyAdminNewIssue(issue, req.user.username, admin.email, appUrl).catch(() => {});
  }

  res.status(201).json({ issue });
});

// Update issue (admin only — change status, add note)
router.put('/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });

  const { status, adminNote } = req.body;
  const validStatuses = ['open', 'in_progress', 'resolved'];
  if (status && !validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const prevStatus = issue.status;
  const prevNote = issue.admin_note;

  db.prepare(`
    UPDATE issues SET
      status = COALESCE(?, status),
      admin_note = COALESCE(?, admin_note),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status || null, adminNote ?? null, req.params.id);

  // Send email to issue reporter
  const updatedIssue = db.prepare('SELECT * FROM issues WHERE id = ?').get(req.params.id);
  const reporter = db.prepare('SELECT email FROM users WHERE id = ?').get(issue.user_id);
  const appUrl = db.prepare("SELECT value FROM settings WHERE key = 'app_url'").get()?.value || '';

  if (reporter?.email) {
    if (status && status !== prevStatus) {
      notifyIssueStatusChanged(updatedIssue, reporter.email, appUrl).catch(() => {});
    } else if (adminNote !== undefined && adminNote !== prevNote) {
      notifyIssueNoteAdded(updatedIssue, reporter.email, appUrl).catch(() => {});
    }
  }

  res.json({ success: true });
});

// Get notes for an issue
router.get('/:id/notes', requireAuth, (req, res) => {
  const db = getDb();
  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  // Only admin or issue owner can see notes
  if (!req.user.is_admin && issue.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  const notes = db.prepare(`
    SELECT n.*, u.username, u.avatar, u.is_admin, u.is_local_admin
    FROM issue_notes n
    JOIN users u ON n.user_id = u.id
    WHERE n.issue_id = ?
    ORDER BY n.created_at ASC
  `).all(req.params.id);
  res.json({ notes });
});

// Post a note on an issue
router.post('/:id/notes', requireAuth, async (req, res) => {
  const db = getDb();
  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  // Only admin or issue owner can post
  if (!req.user.is_admin && issue.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  // Locked if resolved
  if (issue.status === 'resolved') return res.status(403).json({ error: 'Issue is resolved and locked' });

  const { body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'Note body is required' });

  const result = db.prepare(
    'INSERT INTO issue_notes (issue_id, user_id, body) VALUES (?, ?, ?)'
  ).run(req.params.id, req.user.id, body.trim());

  const note = db.prepare(`
    SELECT n.*, u.username, u.avatar, u.is_admin, u.is_local_admin
    FROM issue_notes n JOIN users u ON n.user_id = u.id
    WHERE n.id = ?
  `).get(result.lastInsertRowid);

  // Email notification
  const appUrl = db.prepare("SELECT value FROM settings WHERE key = 'app_url'").get()?.value || '';
  if (req.user.is_admin) {
    // Admin posted — email the issue reporter
    const reporter = db.prepare('SELECT email FROM users WHERE id = ?').get(issue.user_id);
    if (reporter?.email) notifyIssueNoteAdded({ ...issue, admin_note: body.trim() }, reporter.email, appUrl).catch(() => {});
  } else {
    // User posted — email the admin
    const admin = db.prepare('SELECT email FROM users WHERE is_local_admin = 1 OR is_admin = 1 ORDER BY is_local_admin DESC LIMIT 1').get();
    if (admin?.email) {
      const { sendEmail } = require('../services/email');
      const { getEmailConfig } = require('../services/email');
      // Simple admin alert
      notifyAdminNewIssue(
        { ...issue, title: `Reply on: ${issue.title}`, description: body.trim(), type: 'other' },
        req.user.username, admin.email, appUrl
      ).catch(() => {});
    }
  }

  res.status(201).json({ note });
});

// Delete issue (own issues or admin)
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  if (!req.user.is_admin && issue.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM issues WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
