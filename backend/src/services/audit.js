const { getDb } = require('../db');

/**
 * Log an action to the audit log.
 * @param {object} opts
 * @param {number|null} opts.userId
 * @param {string|null} opts.username
 * @param {string} opts.category  — 'request' | 'issue' | 'user' | 'settings' | 'system' | 'auth'
 * @param {string} opts.action    — human-readable action label
 * @param {string|null} opts.detail — optional extra context
 */
function audit({ userId = null, username = null, category, action, detail = null }) {
  try {
    getDb().prepare(
      'INSERT INTO audit_log (user_id, username, category, action, detail) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, username, category, action, detail);
  } catch {}
}

module.exports = { audit };
