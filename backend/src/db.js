const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || '/app/data/singarr.db';

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
    runMigrations();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plex_id TEXT UNIQUE,
      local_username TEXT UNIQUE,
      local_password_hash TEXT,
      username TEXT NOT NULL,
      display_name TEXT DEFAULT NULL,
      email TEXT,
      avatar TEXT,
      is_admin INTEGER DEFAULT 0,
      is_local_admin INTEGER DEFAULT 0,
      is_approved INTEGER DEFAULT 1,
      request_limit_override INTEGER DEFAULT NULL,
      album_limit_override   INTEGER DEFAULT NULL,
      track_limit_override   INTEGER DEFAULT NULL,
      genres TEXT DEFAULT '[]',
      genres_set INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    );

    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('artist', 'album', 'track')),
      musicbrainz_id TEXT,
      lidarr_id INTEGER,
      title TEXT NOT NULL,
      artist_name TEXT,
      cover_url TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'found', 'downloading', 'downloaded', 'rejected', 'unavailable')),
      lidarr_status TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      request_id INTEGER,
      type TEXT NOT NULL CHECK(type IN ('missing_tracks', 'poor_quality', 'other')),
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'resolved')),
      admin_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (request_id) REFERENCES requests(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS plex_library_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plex_rating_key TEXT,
      musicbrainz_id TEXT,
      type TEXT CHECK(type IN ('artist', 'album', 'track')),
      title TEXT NOT NULL,
      artist_name TEXT,
      thumb TEXT,
      quality TEXT,
      genres TEXT,
      synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS discovery_cache (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      category TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS issue_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER NOT NULL,
      user_id INTEGER,
      note_type TEXT DEFAULT 'user',
      body TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_requests_user ON requests(user_id);
    CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
    CREATE INDEX IF NOT EXISTS idx_plex_cache_mbid ON plex_library_cache(musicbrainz_id);
    CREATE INDEX IF NOT EXISTS idx_plex_cache_title ON plex_library_cache(title);
    CREATE INDEX IF NOT EXISTS idx_issues_user ON issues(user_id);
    CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);

    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('allow_artist_requests', 'true'),
      ('allow_album_requests', 'true'),
      ('allow_track_requests', 'true'),
      ('global_request_limit', '10'),
      ('global_album_limit', '10'),
      ('global_track_limit', '20'),
      ('global_request_limit_days', '7'),
      ('require_approval', 'false'),
      ('auto_approve_plex_users', 'true'),
      ('plex_library_sync_interval', '60'),
      ('email_enabled', 'false'),
      ('email_host', ''),
      ('email_port', '587'),
      ('email_secure', 'false'),
      ('email_user', ''),
      ('email_pass', ''),
      ('email_from', ''),
      ('email_from_name', 'Singarr'),
      ('notify_request_fulfilled', 'true'),
      ('notify_request_approved', 'true'),
      ('notify_request_rejected', 'true'),
      ('notify_new_request_admin', 'true'),
      ('notify_new_issue_admin', 'true');
  `);
}

function runMigrations() {
  const userCols = db.pragma('table_info(users)').map(c => c.name);
  if (!userCols.includes('genres'))           db.exec("ALTER TABLE users ADD COLUMN genres TEXT DEFAULT '[]'");
  if (!userCols.includes('genres_set'))        db.exec('ALTER TABLE users ADD COLUMN genres_set INTEGER DEFAULT 0');
  if (!userCols.includes('local_username'))    db.exec('ALTER TABLE users ADD COLUMN local_username TEXT UNIQUE');
  if (!userCols.includes('local_password_hash')) db.exec('ALTER TABLE users ADD COLUMN local_password_hash TEXT');
  if (!userCols.includes('is_local_admin'))    db.exec('ALTER TABLE users ADD COLUMN is_local_admin INTEGER DEFAULT 0');
  if (!userCols.includes('album_limit_override')) db.exec('ALTER TABLE users ADD COLUMN album_limit_override INTEGER DEFAULT NULL');
  if (!userCols.includes('track_limit_override')) db.exec('ALTER TABLE users ADD COLUMN track_limit_override INTEGER DEFAULT NULL');
  if (!userCols.includes('display_name'))         db.exec('ALTER TABLE users ADD COLUMN display_name TEXT DEFAULT NULL');

  // Issues table migration
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  if (!tables.includes('issues')) {
    db.exec(`
      CREATE TABLE issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        request_id INTEGER,
        type TEXT NOT NULL CHECK(type IN ('missing_tracks', 'poor_quality', 'other')),
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'resolved')),
        admin_note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (request_id) REFERENCES requests(id)
      );
      CREATE INDEX IF NOT EXISTS idx_issues_user ON issues(user_id);
      CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
    `);
  }

  // Email notification settings migration
  const emailSettings = [
    ['email_enabled', 'false'], ['email_host', ''], ['email_port', '587'],
    ['email_secure', 'false'], ['email_user', ''], ['email_pass', ''],
    ['email_from', ''], ['email_from_name', 'Singarr'],
    ['notify_request_fulfilled', 'true'], ['notify_request_approved', 'true'],
    ['notify_request_rejected', 'true'], ['notify_new_request_admin', 'true'],
    ['notify_new_issue_admin', 'true'],
  ];
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  emailSettings.forEach(([k, v]) => insertSetting.run(k, v));

  // Per-type limit defaults for existing installs
  insertSetting.run('global_album_limit', '10');
  insertSetting.run('global_track_limit', '20');
  insertSetting.run('plex_open_mode', 'both');

  // quality column for existing plex_library_cache
  const plexCols = db.pragma('table_info(plex_library_cache)').map(c => c.name);
  if (!plexCols.includes('quality')) db.exec('ALTER TABLE plex_library_cache ADD COLUMN quality TEXT');
  if (!plexCols.includes('genres')) db.exec('ALTER TABLE plex_library_cache ADD COLUMN genres TEXT');

  // issue_notes table for existing installs
  const tables2 = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  if (!tables2.includes('audit_log')) {
    db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER, username TEXT, category TEXT NOT NULL,
      action TEXT NOT NULL, detail TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }
  if (!tables2.includes('issue_notes')) {
    db.exec(`
      CREATE TABLE issue_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        issue_id INTEGER NOT NULL,
        user_id INTEGER,
        note_type TEXT DEFAULT 'user',
        body TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
  } else {
    const noteCols = db.pragma('table_info(issue_notes)').map(c => c.name);
    if (!noteCols.includes('note_type')) db.exec("ALTER TABLE issue_notes ADD COLUMN note_type TEXT DEFAULT 'user'");
  }
}

module.exports = { getDb };
