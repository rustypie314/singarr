const axios = require('axios');
const { getDb } = require('../db');

function getPlexConfig() {
  try {
    const db = getDb();
    const url = db.prepare("SELECT value FROM settings WHERE key = 'plex_url'").get()?.value
             || process.env.PLEX_URL || '';
    const token = db.prepare("SELECT value FROM settings WHERE key = 'plex_token'").get()?.value
               || process.env.PLEX_TOKEN || '';
    return { url: url.replace(/\/$/, ''), token };
  } catch {
    return { url: process.env.PLEX_URL || '', token: process.env.PLEX_TOKEN || '' };
  }
}

function plexClient() {
  const { url, token } = getPlexConfig();
  if (!url || !token) return null; // Plex is optional — return null instead of throwing
  return axios.create({
    baseURL: url,
    params: { 'X-Plex-Token': token },
    headers: { Accept: 'application/json' },
    timeout: 15000,
  });
}

async function syncPlexLibrary() {
  const client = plexClient();
  if (!client) {
    console.log('[Plex] Not configured yet — skipping library sync');
    return;
  }

  const db = getDb();

  // Get music library sections
  const sectionsRes = await client.get('/library/sections');
  const sections = (sectionsRes.data?.MediaContainer?.Directory || []).filter(s => s.type === 'artist');

  if (!sections.length) {
    console.log('[Plex] No music library sections found');
    return;
  }

  db.prepare('DELETE FROM plex_library_cache').run();

  let totalArtists = 0, totalAlbums = 0;

  for (const section of sections) {
    const [artistsRes, albumsRes] = await Promise.all([
      client.get(`/library/sections/${section.key}/all`, { params: { type: 8, includeGuids: 1 } }),
      client.get(`/library/sections/${section.key}/all`, { params: { type: 9, includeGuids: 1 } }),
    ]);

    const artists = artistsRes.data?.MediaContainer?.Metadata || [];
    const albums  = albumsRes.data?.MediaContainer?.Metadata  || [];

    const insertArtist = db.prepare(`
      INSERT OR REPLACE INTO plex_library_cache (plex_rating_key, musicbrainz_id, type, title, thumb)
      VALUES (?, ?, 'artist', ?, ?)
    `);
    const insertAlbum = db.prepare(`
      INSERT OR REPLACE INTO plex_library_cache (plex_rating_key, musicbrainz_id, type, title, artist_name, thumb)
      VALUES (?, ?, 'album', ?, ?, ?)
    `);

    function extractMbid(item) {
      const guids = item.Guid || [];
      for (const g of guids) {
        const id = g.id || '';
        if (id.startsWith('mbid://')) return id.replace('mbid://', '');
      }
      return null;
    }

    const insertAll = db.transaction(() => {
      for (const a of artists) insertArtist.run(a.ratingKey, extractMbid(a), a.title, a.thumb);
      for (const a of albums)  insertAlbum.run(a.ratingKey, extractMbid(a), a.title, a.parentTitle, a.thumb);
    });
    insertAll();

    totalArtists += artists.length;
    totalAlbums  += albums.length;
  }

  console.log(`[Plex] Synced library: ${totalArtists} artists, ${totalAlbums} albums`);
}

function isInPlexLibrary(title, artistName, type) {
  const db = getDb();
  if (type === 'artist') {
    return !!db.prepare(
      `SELECT id FROM plex_library_cache WHERE type = 'artist' AND LOWER(title) = LOWER(?)`
    ).get(title);
  } else if (type === 'album') {
    return !!db.prepare(
      `SELECT id FROM plex_library_cache WHERE type = 'album' AND LOWER(title) = LOWER(?)
       AND (? IS NULL OR LOWER(artist_name) = LOWER(?))`
    ).get(title, artistName, artistName);
  }
  return false;
}

module.exports = { syncPlexLibrary, isInPlexLibrary };
