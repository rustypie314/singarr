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
    timeout: 10000,
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

  const [profiles, rootFolders] = await Promise.all([
    client.get('/qualityprofile'),
    client.get('/rootfolder'),
  ]);

  if (!profiles.data.length) throw new Error('No quality profiles configured in Lidarr');
  if (!rootFolders.data.length) throw new Error('No root folders configured in Lidarr');

  const payload = {
    ...artist,
    qualityProfileId: profiles.data[0].id,
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
    const [profiles, rootFolders] = await Promise.all([
      client.get('/qualityprofile'),
      client.get('/rootfolder'),
    ]);
    const newArtist = await client.post('/artist', {
      ...album.artist,
      qualityProfileId: profiles.data[0].id,
      rootFolderPath: rootFolders.data[0].path,
      monitored: true,
      addOptions: { monitor: 'none', searchForMissingAlbums: false },
    });
    artistId = newArtist.data.id;
  } else {
    artistId = existingArtist.id;
  }

  // Monitor and search the album
  await client.put('/album/monitor', { albumIds: [album.id], monitored: true }).catch(() => null);
  await client.post('/command', { name: 'AlbumSearch', albumIds: [album.id] }).catch(() => null);

  return { ...album, artistId };
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
