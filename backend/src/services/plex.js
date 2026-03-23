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
      INSERT OR REPLACE INTO plex_library_cache (plex_rating_key, musicbrainz_id, type, title, artist_name, thumb, quality)
      VALUES (?, ?, 'album', ?, ?, ?, ?)
    `);

    function extractMbid(item) {
      const guids = item.Guid || [];
      for (const g of guids) {
        const id = g.id || '';
        if (id.startsWith('mbid://')) return id.replace('mbid://', '');
      }
      return null;
    }

    // Fetch track quality for all albums in parallel (batched to avoid hammering Plex)
    async function getAlbumQuality(ratingKey) {
      try {
        const res = await client.get(`/library/metadata/${ratingKey}/children`, {
          params: { includeMedia: 1, includeStreams: 1 }
        });
        const tracks = res.data?.MediaContainer?.Metadata || [];
        let maxBitDepth = 0;
        let hasFlac = false;
        for (const track of tracks) {
          const media = track.Media?.[0];
          if (!media) continue;
          const codec = (media.audioCodec || '').toLowerCase();
          const container = (media.container || '').toLowerCase();
          if (codec === 'flac' || container === 'flac') hasFlac = true;
          let bitDepth = media.bitDepth || 0;
          if (!bitDepth) {
            const streams = media.Part?.[0]?.Stream || [];
            for (const stream of streams) {
              if (stream.bitDepth) { bitDepth = stream.bitDepth; break; }
            }
          }
          if (!bitDepth) bitDepth = media.Part?.[0]?.bitDepth || 0;
          if (bitDepth > maxBitDepth) maxBitDepth = bitDepth;
        }
        if (!hasFlac) return null;
        if (maxBitDepth >= 24) return '24bit-flac';
        if (maxBitDepth >= 16) return '16bit-flac';
        // FLAC confirmed but bit depth not found — fetch first track individually
        if (tracks[0]) {
          try {
            const trackRes = await client.get(`/library/metadata/${tracks[0].ratingKey}`, {
              params: { includeStreams: 1 }
            });
            const tMedia = trackRes.data?.MediaContainer?.Metadata?.[0]?.Media?.[0];
            const bd = tMedia?.bitDepth
                    || tMedia?.Part?.[0]?.bitDepth
                    || tMedia?.Part?.[0]?.Stream?.find(s => s.bitDepth)?.bitDepth
                    || 0;
            if (bd >= 24) return '24bit-flac';
            if (bd >= 16) return '16bit-flac';
          } catch {}
        }
        return 'flac';
      } catch { return null; }
    }

        // Batch quality fetches in groups of 10 to avoid overwhelming Plex
    const qualities = [];
    for (let i = 0; i < albums.length; i += 10) {
      const batch = albums.slice(i, i + 10);
      const results = await Promise.all(batch.map(a => getAlbumQuality(a.ratingKey)));
      qualities.push(...results);
    }

    const insertAll = db.transaction(() => {
      for (const a of artists) insertArtist.run(a.ratingKey, extractMbid(a), a.title, a.thumb);
      for (let i = 0; i < albums.length; i++) {
        const a = albums[i];
        insertAlbum.run(a.ratingKey, extractMbid(a), a.title, a.parentTitle, a.thumb, qualities[i] || null);
      }
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
    const row = db.prepare(
      `SELECT id, quality FROM plex_library_cache WHERE type = 'album' AND LOWER(title) = LOWER(?)
       AND (? IS NULL OR LOWER(artist_name) = LOWER(?))`
    ).get(title, artistName, artistName);
    if (!row) return false;
    return { inPlex: true, quality: row.quality || null };
  }
  return false;
}

module.exports = { syncPlexLibrary, isInPlexLibrary };
