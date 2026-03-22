const { getDb } = require('../db');

function getSetting(key) {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function getWindowDays() {
  return parseInt(getSetting('global_request_limit_days') || '7');
}

function getRequestsUsedInWindow(userId, type) {
  const db = getDb();
  const days = getWindowDays();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  if (type) {
    // For artist requests, count against album limit (artist = whole discography)
    const countType = type === 'artist' ? ['artist', 'album'] : [type];
    const placeholders = countType.map(() => '?').join(',');
    const row = db.prepare(`
      SELECT COUNT(*) as count FROM requests
      WHERE user_id = ? AND type IN (${placeholders}) AND created_at >= ? AND status != 'rejected'
    `).get(userId, ...countType, since);
    return row.count;
  }

  const row = db.prepare(`
    SELECT COUNT(*) as count FROM requests
    WHERE user_id = ? AND created_at >= ? AND status != 'rejected'
  `).get(userId, since);
  return row.count;
}

function getTypeLimit(user, type) {
  // Albums and artists share the album limit
  if (type === 'album' || type === 'artist') {
    if (user.album_limit_override !== null && user.album_limit_override !== undefined) {
      return parseInt(user.album_limit_override);
    }
    return parseInt(getSetting('global_album_limit') || '10');
  }
  if (type === 'track') {
    if (user.track_limit_override !== null && user.track_limit_override !== undefined) {
      return parseInt(user.track_limit_override);
    }
    return parseInt(getSetting('global_track_limit') || '20');
  }
  return parseInt(getSetting('global_album_limit') || '10');
}

function checkRequestLimit(user, type) {
  if (user.is_admin) return { allowed: true, used: 0, limit: Infinity, remaining: Infinity };

  const limit = getTypeLimit(user, type);
  const used = getRequestsUsedInWindow(user.id, type);
  const remaining = limit === 0 ? Infinity : Math.max(0, limit - used);

  return {
    allowed: limit === 0 || remaining > 0,
    used,
    limit,
    remaining,
    days: getWindowDays(),
    type,
  };
}

function checkTypeAllowed(type) {
  const db = getDb();
  const keyMap = {
    artist: 'allow_artist_requests',
    album:  'allow_album_requests',
    track:  'allow_track_requests',
  };
  const key = keyMap[type];
  if (!key) return false;
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row?.value === 'true';
}

module.exports = { checkRequestLimit, checkTypeAllowed, getSetting, getTypeLimit };
