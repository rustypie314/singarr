const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const { getDb } = require('./db');
const authRoutes    = require('./routes/auth');
const requestRoutes = require('./routes/requests');
const searchRoutes  = require('./routes/search');
const adminRoutes   = require('./routes/admin');
const plexRoutes    = require('./routes/plex');
const setupRoutes   = require('./routes/setup');
const discoverRoutes = require('./routes/discover');
const issuesRoutes  = require('./routes/issues');
const { syncPlexLibrary }    = require('./services/plex');
const { syncLidarrStatuses } = require('./services/lidarr');

const app = express();
app.set('trust proxy', 1); // Trust nginx reverse proxy
const PORT = process.env.PORT || 3001;

// Init DB
getDb();

// Middleware
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));

// Routes
app.use('/api/setup',    setupRoutes);
app.use('/api/auth',     authRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/search',   searchRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/plex',     plexRoutes);
app.use('/api/discover', discoverRoutes);
app.use('/api/issues',   issuesRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Cron: sync Plex library every 60 minutes
cron.schedule('0 * * * *', async () => {
  console.log('[Cron] Syncing Plex library...');
  try { await syncPlexLibrary(); } catch (e) { console.error('[Cron] Plex sync failed:', e.message); }
});

// Cron: sync Lidarr statuses every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  try { await syncLidarrStatuses(); } catch (e) { console.error('[Cron] Lidarr sync failed:', e.message); }
});

app.listen(PORT, () => {
  console.log(`🎵 Singarr backend running on port ${PORT}`);
  // Initial Plex sync after 10s (gives DB time to be ready)
  setTimeout(async () => {
    try { await syncPlexLibrary(); } catch (e) { console.error('Initial Plex sync failed:', e.message); }
  }, 10000);
});
