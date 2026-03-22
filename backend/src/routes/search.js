const express = require('express');
const axios = require('axios');
const { requireAuth } = require('../middleware/auth');
const { isInPlexLibrary } = require('../services/plex');
const { getDb } = require('../db');

const router = express.Router();

const MB_BASE = 'https://musicbrainz.org/ws/2';
const MB_HEADERS = { 'User-Agent': 'Singarr/1.0 (music-request-app)' };
const CAA_BASE  = 'https://coverartarchive.org';

// Read API keys from DB first, fall back to env
function getApiKey(dbKey, envKey) {
  try {
    const db = getDb();
    return db.prepare('SELECT value FROM settings WHERE key = ?').get(dbKey)?.value
        || process.env[envKey]
        || null;
  } catch {
    return process.env[envKey] || null;
  }
}

// ── Last.fm helpers ───────────────────────────────────────

// Search Last.fm for artists — returns image map keyed by lowercase name
async function lastfmArtistSearch(query) {
  const apiKey = getApiKey('lastfm_api_key', 'LASTFM_API_KEY');
  if (!apiKey) return {};
  try {
    const res = await axios.get('https://ws.audioscrobbler.com/2.0/', {
      params: { method: 'artist.search', artist: query, api_key: apiKey, format: 'json', limit: 20 },
      timeout: 6000,
    });
    const artists = res.data?.results?.artistmatches?.artist || [];
    const map = {};
    for (const a of artists) {
      // Last.fm returns array of images: small, medium, large, extralarge, mega
      const images = Array.isArray(a.image) ? a.image : [];
      const img = images.find(i => i.size === 'extralarge')?.['#text']
               || images.find(i => i.size === 'large')?.['#text']
               || images.find(i => i.size === 'mega')?.['#text']
               || null;
      // Skip the generic placeholder image Last.fm uses
      if (img && !img.includes('2a96cbd8b46e442fc41c2b86b821562f')) {
        map[a.name.toLowerCase()] = img;
      }
    }
    return map;
  } catch { return {}; }
}

async function lastfmArtistInfo(artistName) {
  const apiKey = getApiKey('lastfm_api_key', 'LASTFM_API_KEY');
  if (!apiKey) return null;
  try {
    const res = await axios.get('https://ws.audioscrobbler.com/2.0/', {
      params: { method: 'artist.getinfo', artist: artistName, api_key: apiKey, format: 'json' },
      timeout: 5000,
    });
    return res.data?.artist || null;
  } catch { return null; }
}

// ── Fanart.tv helpers ─────────────────────────────────────

async function fanartArtistImages(mbid) {
  const apiKey = getApiKey('fanart_api_key', 'FANART_API_KEY');
  if (!apiKey) return null;
  try {
    const res = await axios.get(`https://webservice.fanart.tv/v3/music/${mbid}`, {
      params: { api_key: apiKey },
      timeout: 5000,
    });
    return res.data || null;
  } catch { return null; }
}

// ── Cover Art Archive ─────────────────────────────────────

async function getCoverArt(mbid) {
  try {
    const res = await axios.get(`${CAA_BASE}/release-group/${mbid}`, { timeout: 5000 });
    return res.data?.images?.[0]?.thumbnails?.['500']
        || res.data?.images?.[0]?.thumbnails?.small
        || res.data?.images?.[0]?.image
        || null;
  } catch { return null; }
}

// ── GET /search/artists ───────────────────────────────────
router.get('/artists', requireAuth, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query required' });

  try {
    const mbRes = await axios.get(`${MB_BASE}/artist`, {
      params: { query: q, limit: 12, fmt: 'json' },
      headers: MB_HEADERS,
      timeout: 8000,
    });

    const db = getDb();
    const rawArtists = mbRes.data.artists || [];

    // Fetch Fanart images for top 3 only (requires MBID, one call each)
    const top3Fanart = await Promise.all(
      rawArtists.slice(0, 3).map(a => fanartArtistImages(a.id).catch(() => null))
    );

    const artists = rawArtists.map((artist, i) => {
      const inPlex = isInPlexLibrary(artist.name, null, 'artist');
      const existingRequest = db.prepare(
        `SELECT status FROM requests WHERE musicbrainz_id = ? AND type = 'artist'`
      ).get(artist.id);

      const fanart = i < 3 ? top3Fanart[i] : null;
      const thumbUrl = fanart?.artistthumb?.[0]?.url
                    || fanart?.artistbackground?.[0]?.url
                    || null;

      return {
        id: artist.id,
        name: artist.name,
        type: artist.type,
        country: artist.country,
        disambiguation: artist.disambiguation,
        score: artist.score,
        thumbUrl,
        inPlex,
        requestStatus: existingRequest?.status || null,
      };
    });

    res.json({ results: artists });
  } catch (e) {
    console.error('Artist search error:', e.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ── GET /search/albums ────────────────────────────────────
router.get('/albums', requireAuth, async (req, res) => {
  const { q, type = 'album' } = req.query;
  if (!q) return res.status(400).json({ error: 'Query required' });

  // MusicBrainz requires type filtering in the lucene query string
  const typeMap = {
    'album':       'primarytype:Album AND NOT secondarytype:*',
    'ep|single':   '(primarytype:EP OR primarytype:Single)',
    'compilation': 'secondarytype:Compilation',
    'live':        'secondarytype:Live',
  };
  const typeFilter = typeMap[type] || `primarytype:${type}`;
  const fullQuery = `${q} AND ${typeFilter}`;

  // Post-fetch filters to strictly enforce type (MusicBrainz scoring is fuzzy)
  const strictFilter = (rg) => {
    const primary = (rg['primary-type'] || '').toLowerCase();
    const secondary = (rg['secondary-types'] || []).map(s => s.toLowerCase());
    if (type === 'album')       return primary === 'album' && !secondary.includes('compilation') && !secondary.includes('live');
    if (type === 'ep|single')   return primary === 'ep' || primary === 'single';
    if (type === 'compilation') return secondary.includes('compilation');
    if (type === 'live')        return secondary.includes('live');
    return true;
  };

  try {
    const mbRes = await axios.get(`${MB_BASE}/release-group`, {
      params: { query: fullQuery, limit: 25, fmt: 'json' },
      headers: MB_HEADERS,
      timeout: 8000,
    });

    const db = getDb();
    const releaseGroups = (mbRes.data['release-groups'] || []).filter(strictFilter).slice(0, 12);
    const coverResults = await Promise.all(
      releaseGroups.map(album => getCoverArt(album.id).catch(() => null))
    );

    const albums = releaseGroups.map((album, i) => {
      const artistName = album['artist-credit']?.[0]?.artist?.name
                      || album['artist-credit']?.[0]?.name
                      || '';
      const inPlex = isInPlexLibrary(album.title, artistName, 'album');
      const existingRequest = db.prepare(
        `SELECT status FROM requests WHERE musicbrainz_id = ? AND type = 'album'`
      ).get(album.id);

      return {
        id: album.id,
        title: album.title,
        artistName,
        artistId: album['artist-credit']?.[0]?.artist?.id,
        year: album['first-release-date']?.substring(0, 4),
        coverUrl: coverResults[i] || null,
        releaseType: album['primary-type'] || type,
        inPlex,
        requestStatus: existingRequest?.status || null,
      };
    });

    res.json({ results: albums });
  } catch (e) {
    console.error('Album search error:', e.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ── GET /search/tracks ────────────────────────────────────
router.get('/tracks', requireAuth, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query required' });

  try {
    const mbRes = await axios.get(`${MB_BASE}/recording`, {
      params: { query: q, limit: 12, fmt: 'json' },
      headers: MB_HEADERS,
      timeout: 8000,
    });

    const db = getDb();

    const tracks = (mbRes.data.recordings || []).map((track) => {
      const artistName = track['artist-credit']?.[0]?.artist?.name || '';
      const existingRequest = db.prepare(
        `SELECT status FROM requests WHERE musicbrainz_id = ? AND type = 'track'`
      ).get(track.id);

      return {
        id: track.id,
        title: track.title,
        artistName,
        artistId: track['artist-credit']?.[0]?.artist?.id,
        duration: track.length,
        releaseTitle: track.releases?.[0]?.title,
        releaseId: track.releases?.[0]?.id,
        requestStatus: existingRequest?.status || null,
      };
    });

    res.json({ results: tracks });
  } catch (e) {
    console.error('Track search error:', e.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ── GET /search/album/:mbid/tracks ───────────────────────
router.get('/album/:mbid/tracks', requireAuth, async (req, res) => {
  try {
    const { mbid } = req.params;

    const rgRes = await axios.get(`${MB_BASE}/release`, {
      params: { 'release-group': mbid, limit: 1, fmt: 'json', inc: 'recordings' },
      headers: MB_HEADERS,
      timeout: 8000,
    });

    const releases = rgRes.data.releases || [];
    if (!releases.length) return res.json({ tracks: [] });

    const release = releases[0];
    const tracks = [];

    for (const medium of release.media || []) {
      for (const track of medium.tracks || []) {
        tracks.push({
          id: track.id,
          recordingId: track.recording?.id,
          number: track.number,
          position: track.position,
          title: track.title || track.recording?.title || 'Unknown',
          duration: track.length || track.recording?.length || null,
          discNumber: medium.position,
          totalDiscs: release.media.length,
        });
      }
    }

    res.json({ tracks, releaseTitle: release.title, releaseId: release.id });
  } catch (e) {
    console.error('Track fetch error:', e.message);
    res.status(500).json({ error: 'Failed to fetch tracks', tracks: [] });
  }
});

// ── GET /search/artist/:mbid — full artist detail ────────
router.get('/artist/:mbid', requireAuth, async (req, res) => {
  try {
    const { mbid } = req.params;
    const artistName = req.query.name || '';

    const [mbData, lfm, fanart] = await Promise.all([
      axios.get(`${MB_BASE}/artist/${mbid}`, {
        params: { inc: 'release-groups', fmt: 'json' },
        headers: MB_HEADERS,
        timeout: 8000,
      }).then(r => r.data).catch(() => null),
      lastfmArtistInfo(artistName),
      fanartArtistImages(mbid),
    ]);

    // Build image sources with priority: fanart > lastfm
    const lfmImages = Array.isArray(lfm?.image) ? lfm.image : [];
    const lfmLarge = lfmImages.find(i => i.size === 'extralarge')?.['#text']
                  || lfmImages.find(i => i.size === 'mega')?.['#text']
                  || null;
    const lfmThumb = lfmLarge && !lfmLarge.includes('2a96cbd8b46e442fc41c2b86b821562f') ? lfmLarge : null;

    res.json({
      mbData,
      bio: lfm?.bio?.summary?.replace(/<[^>]*>/g, '').split(' Read more')[0] || null,
      images: {
        thumb:      fanart?.artistthumb?.[0]?.url      || lfmThumb || null,
        background: fanart?.artistbackground?.[0]?.url || null,
        logo:       fanart?.hdmusiclogo?.[0]?.url      || fanart?.musiclogo?.[0]?.url || null,
        banner:     fanart?.musicbanner?.[0]?.url      || null,
      },
      tags:    lfm?.tags?.tag?.map(t => t.name) || [],
      similar: lfm?.similar?.artist?.slice(0, 5).map(a => a.name) || [],
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get artist details' });
  }
});

// ── GET /search/artist/:mbid/albums ───────────────────────
router.get('/artist/:mbid/albums', requireAuth, async (req, res) => {
  try {
    const { mbid } = req.params;
    const db = getDb();

    const rgRes = await axios.get(`${MB_BASE}/release-group`, {
      params: { artist: mbid, limit: 100, fmt: 'json', type: 'album|ep|single' },
      headers: MB_HEADERS,
      timeout: 10000,
    });

    const groups = rgRes.data['release-groups'] || [];

    // Sort: albums first, then EPs, then singles, each by date desc
    const typeOrder = { Album: 0, EP: 1, Single: 2 };
    groups.sort((a, b) => {
      const ta = typeOrder[a['primary-type']] ?? 9;
      const tb = typeOrder[b['primary-type']] ?? 9;
      if (ta !== tb) return ta - tb;
      const da = a['first-release-date'] || '';
      const db2 = b['first-release-date'] || '';
      return db2.localeCompare(da);
    });

    // Fetch cover art for first 20 only to keep it fast
    const toFetch = groups.slice(0, 20);
    const covers = await Promise.all(toFetch.map(g => getCoverArt(g.id).catch(() => null)));

    const albums = groups.map((g, i) => {
      const existingRequest = db.prepare(
        `SELECT status FROM requests WHERE musicbrainz_id = ? AND type = 'album'`
      ).get(g.id);
      return {
        id: g.id,
        title: g.title,
        year: g['first-release-date']?.substring(0, 4) || null,
        type: g['primary-type'] || 'Album',
        coverUrl: i < 20 ? (covers[i] || null) : null,
        requestStatus: existingRequest?.status || null,
      };
    });

    res.json({ albums });
  } catch (e) {
    console.error('Artist albums error:', e.message);
    res.status(500).json({ error: 'Failed to fetch artist albums', albums: [] });
  }
});

module.exports = router;
