const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const PLEX_CLIENT_ID = process.env.PLEX_CLIENT_ID || 'singarr';

// ── Check setup status ────────────────────────────────────
router.get('/status', (req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'setup_complete'").get();
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get();
  res.json({
    setupComplete: row?.value === 'true',
    hasAdmin: userCount.c > 0,
  });
});

// ── Step 1: Create local admin account ───────────────────
router.post('/local-admin', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (username.trim().length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const db = getDb();

  // Only allow if no admin exists yet
  const existing = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_admin = 1').get();
  if (existing.c > 0) {
    return res.status(409).json({ error: 'An admin account already exists' });
  }

  const existingUsername = db.prepare('SELECT id FROM users WHERE local_username = ?').get(username.trim());
  if (existingUsername) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const hash = await bcrypt.hash(password, 12);
  const result = db.prepare(`
    INSERT INTO users (local_username, local_password_hash, username, is_admin, is_local_admin, is_approved)
    VALUES (?, ?, ?, 1, 1, 1)
  `).run(username.trim(), hash, username.trim());

  const token = jwt.sign({ userId: result.lastInsertRowid }, JWT_SECRET, { expiresIn: '30d' });
  res.json({
    success: true,
    token,
    user: { id: result.lastInsertRowid, username: username.trim(), isAdmin: true, isLocalAdmin: true }
  });
});

// ── Step 1 (optional): Link Plex to local admin ──────────
router.post('/plex/pin', async (req, res) => {
  try {
    const response = await axios.post('https://plex.tv/api/v2/pins', { strong: true }, {
      headers: {
        'Accept': 'application/json',
        'X-Plex-Product': 'Singarr',
        'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
      }
    });
    res.json({ id: response.data.id, code: response.data.code });
  } catch (e) {
    res.status(500).json({ error: 'Failed to connect to Plex' });
  }
});

router.get('/plex/pin/:pinId', async (req, res) => {
  const { linkToUserId } = req.query;
  try {
    const response = await axios.get(`https://plex.tv/api/v2/pins/${req.params.pinId}`, {
      headers: { 'Accept': 'application/json', 'X-Plex-Client-Identifier': PLEX_CLIENT_ID }
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

    if (linkToUserId) {
      // Link Plex account to existing local admin
      db.prepare('UPDATE users SET plex_id = ?, avatar = ?, email = ? WHERE id = ?')
        .run(String(plexUser.id), plexUser.thumb, plexUser.email, parseInt(linkToUserId));
      return res.json({ authenticated: true, linked: true, avatar: plexUser.thumb });
    }

    res.json({ authenticated: true, plexUsername: plexUser.username, plexAvatar: plexUser.thumb });
  } catch (e) {
    console.error('Setup Plex PIN error:', e.message);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// ── Step 2: Test Lidarr connection ────────────────────────
router.post('/test/lidarr', async (req, res) => {
  const db = getDb();
  const MASK = '••••••••';
  const url = req.body.url;
  const apiKey = req.body.apiKey === MASK
    ? db.prepare("SELECT value FROM settings WHERE key = 'lidarr_api_key'").get()?.value
    : req.body.apiKey;
  if (!url || !apiKey) return res.status(400).json({ ok: false, error: 'URL and API key required' });
  try {
    const response = await axios.get(`${url.replace(/\/$/, '')}/api/v1/system/status`, {
      headers: { 'X-Api-Key': apiKey },
      timeout: 8000,
    });
    res.json({ ok: true, version: response.data.version, appName: response.data.appName });
  } catch (e) {
    res.json({ ok: false, error: e.response?.data?.message || 'Could not connect to Lidarr' });
  }
});

// ── Step 3: Test Last.fm ──────────────────────────────────
router.post('/test/lastfm', async (req, res) => {
  const db = getDb();
  const MASK = '••••••••';
  const apiKey = req.body.apiKey === MASK
    ? db.prepare("SELECT value FROM settings WHERE key = 'lastfm_api_key'").get()?.value
    : req.body.apiKey;
  if (!apiKey) return res.status(400).json({ ok: false, error: 'API key required' });
  try {
    const response = await axios.get('https://ws.audioscrobbler.com/2.0/', {
      params: { method: 'chart.getTopArtists', api_key: apiKey, format: 'json', limit: 1 },
      timeout: 8000,
    });
    if (response.data.error) return res.json({ ok: false, error: response.data.message });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: 'Could not connect to Last.fm' });
  }
});

// ── Step 3: Test Fanart.tv ────────────────────────────────
router.post('/test/fanart', async (req, res) => {
  const db = getDb();
  const MASK = '••••••••';
  const apiKey = req.body.apiKey === MASK
    ? db.prepare("SELECT value FROM settings WHERE key = 'fanart_api_key'").get()?.value
    : req.body.apiKey;
  if (!apiKey) return res.status(400).json({ ok: false, error: 'API key required' });
  try {
    await axios.get('https://webservice.fanart.tv/v3/music/b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d', {
      params: { api_key: apiKey },
      timeout: 8000,
    });
    res.json({ ok: true });
  } catch (e) {
    if (e.response?.status === 401 || e.response?.status === 403) {
      return res.json({ ok: false, error: 'Invalid API key' });
    }
    res.json({ ok: false, error: 'Could not connect to Fanart.tv' });
  }
});

// ── Step 3: Test Plex server ──────────────────────────────
router.post('/test/plex', async (req, res) => {
  const db = getDb();
  const MASK = '••••••••';
  const url = req.body.url;
  const token = req.body.token === MASK
    ? db.prepare("SELECT value FROM settings WHERE key = 'plex_token'").get()?.value
    : req.body.token;
  if (!url || !token) return res.status(400).json({ ok: false, error: 'URL and token required' });
  try {
    const baseUrl = url.replace(/\/$/, '');
    const [rootRes, identityRes] = await Promise.all([
      axios.get(`${baseUrl}/`, {
        params: { 'X-Plex-Token': token },
        headers: { Accept: 'application/json' },
        timeout: 8000,
      }),
      axios.get(`${baseUrl}/identity`, {
        params: { 'X-Plex-Token': token },
        headers: { Accept: 'application/json' },
        timeout: 8000,
      }),
    ]);
    const name = rootRes.data?.MediaContainer?.friendlyName || 'Plex Server';
    const machineId = identityRes.data?.MediaContainer?.machineIdentifier || null;

    // Store machineIdentifier in settings for Open in Plex links
    if (machineId) {
      const db = getDb();
      db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
        .run('plex_machine_id', machineId);
    }

    res.json({ ok: true, serverName: name, machineId });
  } catch (e) {
    res.json({ ok: false, error: 'Could not connect to Plex server' });
  }
});

// ── Test Discogs ──────────────────────────────────────────
router.post('/test/discogs', async (req, res) => {
  const db = getDb();
  const MASK = '••••••••';
  const apiKey = req.body.apiKey === MASK
    ? db.prepare("SELECT value FROM settings WHERE key = 'discogs_api_key'").get()?.value
    : req.body.apiKey;
  if (!apiKey) return res.status(400).json({ ok: false, error: 'Token required' });
  try {
    await axios.get('https://api.discogs.com/database/search', {
      params: { q: 'test', per_page: 1 },
      headers: { Authorization: `Discogs token=${apiKey}`, 'User-Agent': 'Singarr/1.0' },
      timeout: 8000,
    });
    res.json({ ok: true });
  } catch (e) {
    if (e.response?.status === 401 || e.response?.status === 403) {
      return res.json({ ok: false, error: 'Invalid token' });
    }
    res.json({ ok: false, error: 'Could not connect to Discogs' });
  }
});

// ── Step 4: Fetch Plex users ──────────────────────────────
router.post('/plex/users', async (req, res) => {
  const db = getDb();
  const MASK = '••••••••';
  const plexUrl = req.body.plexUrl;
  const plexToken = req.body.plexToken === MASK
    ? db.prepare("SELECT value FROM settings WHERE key = 'plex_token'").get()?.value
    : req.body.plexToken;
  if (!plexToken) return res.status(400).json({ error: 'Plex token required' });
  try {
    const headers = {
      'X-Plex-Token': plexToken,
      'X-Plex-Client-Identifier': 'singarr',
      'X-Plex-Product': 'Singarr',
      'Accept': 'application/json',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    };

    const [friendsV2Res, homeRes] = await Promise.allSettled([
      axios.get('https://plex.tv/api/v2/friends', { headers, timeout: 10000 }),
      axios.get('https://plex.tv/api/v2/home/users', { headers, timeout: 10000 }),
    ]);

    const users = [];
    const seen = new Set();

    // v2 friends
    if (friendsV2Res.status === 'fulfilled') {
      const friends = Array.isArray(friendsV2Res.value.data) ? friendsV2Res.value.data : [];
      console.log(`[Plex] v2 friends returned ${friends.length} users:`, friends.map(u => u.username).join(', '));
      for (const u of friends) {
        const id = String(u.id || u.uuid);
        if (!seen.has(id)) {
          seen.add(id);
          users.push({ plexId: id, username: u.username || u.title, email: u.email || '', avatar: u.thumb || u.avatar || null, source: 'friend' });
        }
      }
    } else {
      console.log(`[Plex] v2 friends failed:`, friendsV2Res.reason?.message);
    }

    // v2 home users
    if (homeRes.status === 'fulfilled') {
      const raw = homeRes.value.data;
      const homeUsers = Array.isArray(raw) ? raw : (raw?.users || []);
      console.log(`[Plex] v2 home users returned ${homeUsers.length} users:`, homeUsers.map(u => u.username || u.title).join(', '));
      for (const u of homeUsers) {
        const id = String(u.id || u.uuid);
        if (!seen.has(id)) {
          seen.add(id);
          users.push({ plexId: id, username: u.username || u.title, email: u.email || '', avatar: u.thumb || u.avatar || null, source: 'home' });
        }
      }
    } else {
      console.log(`[Plex] v2 home users failed:`, homeRes.reason?.message);
    }

    console.log(`[Plex] Total users for import: ${users.length}`);
    res.json({ users });
  } catch (e) {
    res.json({ users: [], error: e.message });
  }
});

// ── Final: Save all settings and complete setup ───────────
router.post('/complete', async (req, res) => {
  const { lidarrUrl, lidarrApiKey, lastfmApiKey, fanartApiKey, plexUrl, plexToken, approvedUsers } = req.body;

  const db = getDb();
  const save = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');

  const saveAll = db.transaction(() => {
    if (lidarrUrl)    save.run('lidarr_url',     lidarrUrl);
    if (lidarrApiKey) save.run('lidarr_api_key', lidarrApiKey);
    if (lastfmApiKey) save.run('lastfm_api_key', lastfmApiKey);
    if (fanartApiKey) save.run('fanart_api_key', fanartApiKey);
    if (plexUrl)      save.run('plex_url',        plexUrl);
    if (plexToken)    save.run('plex_token',      plexToken);
    save.run('setup_complete', 'true');
  });
  saveAll();

  if (approvedUsers?.length) {
    const upsert = db.prepare(`
      INSERT INTO users (plex_id, username, email, avatar, is_admin, is_approved)
      VALUES (?, ?, ?, ?, 0, 1)
      ON CONFLICT(plex_id) DO UPDATE SET username=excluded.username, is_approved=1
    `);
    const importAll = db.transaction(() => {
      for (const u of approvedUsers) {
        upsert.run(u.plexId, u.username, u.email || '', u.avatar || '');
      }
    });
    importAll();
  }

  res.json({ success: true });
});

module.exports = router;
