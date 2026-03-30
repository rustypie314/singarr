const axios = require('axios');
const { getDb } = require('../db');

// Read config from DB first, fall back to env — called fresh every request
function getLidarrConfig() {
  try {
    const db = getDb();
    const url = db.prepare("SELECT value FROM settings WHERE key = 'lidarr_url'").get()?.value
             || process.env.LIDARR_URL || '';
    const key = db.prepare("SELECT value FROM settings WHERE key = 'lidarr_api_key'").get()?.value
             || process.env.LIDARR_API_KEY || '';
    return { url: url.replace(/\/$/, ''), key };
  } catch {
    return { url: process.env.LIDARR_URL || '', key: process.env.LIDARR_API_KEY || '' };
  }
}

function lidarrClient() {
  const { url, key } = getLidarrConfig();
  if (!url || !key) throw new Error('Lidarr is not configured. Add your URL and API key in Admin → Settings.');
  return axios.create({
    baseURL: `${url}/api/v1`,
    headers: { 'X-Api-Key': key },
    timeout: 30000,
  });
}

async function addArtistToLidarr(mbid, artistName) {
  const client = lidarrClient();

  const lookup = await client.get('/artist/lookup', { params: { term: `lidarr:${mbid}` } });
  if (!lookup.data || lookup.data.length === 0) throw new Error('Artist not found in Lidarr');

  const artist = lookup.data[0];

  // Check if already in Lidarr
  const existing = await client.get('/artist').then(r =>
    r.data.find(a => a.foreignArtistId === artist.foreignArtistId)
  ).catch(() => null);

  if (existing) return existing;

  const [profiles, rootFolders, metadataProfiles] = await Promise.all([
    client.get('/qualityprofile'),
    client.get('/rootfolder'),
    client.get('/metadataprofile'),
  ]);

  if (!profiles.data.length) throw new Error('No quality profiles configured in Lidarr');
  if (!rootFolders.data.length) throw new Error('No root folders configured in Lidarr');
  if (!metadataProfiles.data.length) throw new Error('No metadata profiles configured in Lidarr');

  const payload = {
    ...artist,
    qualityProfileId: profiles.data[0].id,
    metadataProfileId: metadataProfiles.data[0].id,
    rootFolderPath: rootFolders.data[0].path,
    monitored: true,
    addOptions: { monitor: 'all', searchForMissingAlbums: true },
  };

  const result = await client.post('/artist', payload);
  return result.data;
}

async function addAlbumToLidarr(mbid) {
  const client = lidarrClient();

  const lookup = await client.get('/album/lookup', { params: { term: `lidarr:${mbid}` } });
  if (!lookup.data || lookup.data.length === 0) throw new Error('Album not found in Lidarr');

  const album = lookup.data[0];

  // Check if artist already in Lidarr
  const existingArtist = await client.get('/artist').then(r =>
    r.data.find(a => a.foreignArtistId === album.artist?.foreignArtistId)
  ).catch(() => null);

  let artistId;
  if (!existingArtist) {
    const [profiles, rootFolders, metadataProfiles] = await Promise.all([
      client.get('/qualityprofile'),
      client.get('/rootfolder'),
      client.get('/metadataprofile'),
    ]);
    if (!profiles.data.length) throw new Error('No quality profiles configured in Lidarr');
    if (!rootFolders.data.length) throw new Error('No root folders configured in Lidarr');
    if (!metadataProfiles.data.length) throw new Error('No metadata profiles configured in Lidarr');

    // Do a proper artist lookup to get the full object Lidarr expects
    const artistMbid = album.artist?.foreignArtistId;
    if (!artistMbid) throw new Error('Could not determine artist MusicBrainz ID from album lookup');

    const artistLookup = await client.get('/artist/lookup', { params: { term: `lidarr:${artistMbid}` } });
    if (!artistLookup.data?.length) throw new Error('Artist not found in Lidarr lookup');
    const artistData = artistLookup.data[0];

    const newArtistRes = await client.post('/artist', {
      ...artistData,
      qualityProfileId: profiles.data[0].id,
      metadataProfileId: metadataProfiles.data[0].id,
      rootFolderPath: rootFolders.data[0].path,
      monitored: true,
      addOptions: { monitor: 'none', searchForMissingAlbums: false },
    });
    artistId = newArtistRes.data.id;

    // Ensure artist is monitored (addOptions: monitor:'none' can override monitored:true)
    await client.put(`/artist/${artistId}`, {
      ...newArtistRes.data,
      monitored: true,
    }).catch(() => null);

    // Wait for Lidarr to index the artist's albums (retry up to 10s)
    let lidarrAlbum = null;
    console.log(`[Lidarr] Artist added (id=${artistId}), waiting for albums to index...`);
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const albums = await client.get('/album', { params: { artistId } }).then(r => r.data).catch(() => []);
      console.log(`[Lidarr] Poll ${i + 1}: found ${albums.length} albums`);
      lidarrAlbum = albums.find(a => a.foreignAlbumId === mbid);
      if (lidarrAlbum) break;
    }

    if (!lidarrAlbum) throw new Error('Album not found in Lidarr after artist was added — try again in a moment');

    console.log(`[Lidarr] Found album id=${lidarrAlbum.id}, monitoring and searching...`);
    const monitorRes = await client.put('/album/monitor', { albumIds: [lidarrAlbum.id], monitored: true })
      .catch(e => { console.error('[Lidarr] Monitor failed:', e.response?.data || e.message); return null; });
    console.log(`[Lidarr] Monitor result: ${monitorRes?.status}`);
    const searchRes = await client.post('/command', { name: 'AlbumSearch', albumIds: [lidarrAlbum.id] })
      .catch(e => { console.error('[Lidarr] Search command failed:', e.response?.data || e.message); return null; });
    console.log(`[Lidarr] Search result: ${searchRes?.status} data: ${JSON.stringify(searchRes?.data)}`);

    return { ...lidarrAlbum, artistId };
  } else {
    artistId = existingArtist.id;

    // Artist already exists — find album directly from Lidarr's index
    const albums = await client.get('/album', { params: { artistId } }).then(r => r.data).catch(() => []);
    const lidarrAlbum = albums.find(a => a.foreignAlbumId === mbid);

    if (lidarrAlbum) {
      await client.put('/album/monitor', { albumIds: [lidarrAlbum.id], monitored: true }).catch(() => null);
      await client.post('/command', { name: 'AlbumSearch', albumIds: [lidarrAlbum.id] }).catch(() => null);
      return { ...lidarrAlbum, artistId };
    } else {
      // Album not yet indexed — trigger a refresh then search
      await client.post('/command', { name: 'RefreshArtist', artistId }).catch(() => null);
      await new Promise(r => setTimeout(r, 3000));
      const refreshedAlbums = await client.get('/album', { params: { artistId } }).then(r => r.data).catch(() => []);
      const refreshedAlbum = refreshedAlbums.find(a => a.foreignAlbumId === mbid);
      if (refreshedAlbum) {
        await client.put('/album/monitor', { albumIds: [refreshedAlbum.id], monitored: true }).catch(() => null);
        await client.post('/command', { name: 'AlbumSearch', albumIds: [refreshedAlbum.id] }).catch(() => null);
        return { ...refreshedAlbum, artistId };
      }
      return { ...album, artistId };
    }
  }
}

async function syncLidarrStatuses() {
  // Silently skip if Lidarr isn't configured yet
  const { url, key } = getLidarrConfig();
  if (!url || !key) return;

  const db = getDb();
  const pendingRequests = db.prepare(`
    SELECT * FROM requests
    WHERE status NOT IN ('downloaded', 'rejected', 'unavailable')
    AND lidarr_id IS NOT NULL
  `).all();

  if (!pendingRequests.length) return;

  const client = lidarrClient();
  const { notifyRequestFulfilled } = require('./email');
  const appUrl = process.env.APP_URL || '';

  for (const req of pendingRequests) {
    try {
      let newStatus = null;
      if (req.type === 'artist') {
        const artist = await client.get(`/artist/${req.lidarr_id}`).then(r => r.data).catch(() => null);
        if (artist) {
          newStatus = artist.statistics?.percentOfTracks === 100 ? 'downloaded'
            : artist.statistics?.trackFileCount > 0 ? 'downloading'
            : 'found';
          db.prepare('UPDATE requests SET lidarr_status = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(JSON.stringify(artist.statistics), newStatus, req.id);
        }
      } else if (req.type === 'album') {
        const albums = await client.get('/album', { params: { artistId: req.lidarr_id } }).then(r => r.data).catch(() => null);
        if (albums?.length) {
          const album = albums.find(a => a.foreignAlbumId === req.musicbrainz_id) || albums[0];
          newStatus = album.statistics?.percentOfTracks === 100 ? 'downloaded'
            : album.grabbed ? 'downloading'
            : 'found';
          db.prepare('UPDATE requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(newStatus, req.id);
        }
      }

      // Email user when newly downloaded
      if (newStatus === 'downloaded' && req.status !== 'downloaded') {
        const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user_id);
        if (user?.email) {
          notifyRequestFulfilled(req, user.email, appUrl).catch(() => {});
        }
      }
    } catch (e) {
      console.error(`Failed to sync request ${req.id}:`, e.message);
    }
  }
}

module.exports = { addArtistToLidarr, addAlbumToLidarr, syncLidarrStatuses };
