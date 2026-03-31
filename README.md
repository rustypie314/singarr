# 🎵 Singarr

Singarr is an Overseerr-style music request app for Plex + Lidarr. Users sign in with their Plex account and request artists or albums. Requests are automatically sent to Lidarr for acquisition — or held for admin approval first.

**Docker Hub:** `rustypie/singarr:latest` · **Port:** `8684`

---

## Screenshots

![Login](screenshots/login.png)

![Discover](screenshots/discover.png)

![Settings Overview](screenshots/admin.png)

![Settings Administration](screenshots/settings.png)

![Analytics](screenshots/analytics.png)

---

## Features

### Core
- 🔐 **Plex OAuth login** — users sign in with their Plex account; local admin account also supported
- 🎵 **Request artists or albums** — each type can be toggled on/off by admins
- 📚 **Plex library awareness** — prevents requesting content already in your library
- 🚦 **Request limits** — separate global limits for albums and tracks, with per-user overrides
- 📊 **Status tracking** — pending → approved → found → downloading → downloaded
- ✅ **Admin approval workflow** — optionally require admin approval before requests go to Lidarr
- ⚙️ **Admin panel** — manage users, settings, and all requests from one place
- 🎨 **Dark & light themes** — smooth, polished UI with full mobile support

### Search
- 🔍 **Full search** — Artists, Albums, EPs & Singles, Compilations, Live Albums, Tracks
- 🎤 **Artist expansion** — click an artist to browse their albums, click an album to see tracks
- 📄 **Pagination** — all search tabs support multiple pages of results
- ✅ **Plex & quality badges** — search results show if content is already in Plex with audio quality (16-bit / 24-bit FLAC)

### Discover Page
- 🎨 **Artist images** — powered by Fanart.tv with Plex thumbnail fallback
- 💿 **Album art** — 4-level fallback: Cover Art Archive → Last.fm → Plex thumbnail
- 🏷️ **FLAC quality badges** — albums show 16-bit or 24-bit FLAC quality where available
- 🎸 **Genre browsing** — filter your library artists by genre
- 🎯 **Similar artists** — after requesting an artist, see similar artist suggestions from Last.fm
- ▶️ **Open in Plex** — one-click buttons to open artists and albums directly in Plex

### Open in Plex
- **Admins** can choose between Plex Web, Local Server, or Both in Settings → Services
- **Plex users** always open via Plex Web (can't access the local network remotely)
- **Both mode** — shows two buttons: globe icon (Plex Web) and monitor icon (Local Server)
- **Single mode** — person icon for artists, disc icon for albums — both in Plex yellow
- Note displayed in settings clarifying this only applies to the local admin account

### Request Management
- 📬 **Recent requests** — shown on Discover with Open in Plex buttons for downloaded items
- ✅ **Approve / Reject buttons** — appear inline on pending requests for admins only
- ✕ **Reject with reason** — optional text box when rejecting; reason saved and emailed to user
- ℹ️ **Rejection info icon** — users see a small *i* button on rejected requests to view the reason
- 🗑️ **Custom delete confirmation** — styled modal showing album title (no browser dialogs)
- 📧 **Email notifications** — users notified on approval, rejection (with reason), and download completion

### Issues
- 🐛 **Issue reporting** — users can report problems with downloaded music
- 💬 **Threaded notes** — real-time discussion thread on each issue via Server-Sent Events
- 🔒 **Locked threads** — resolved issues are locked; status progression is one-way
- 📧 **Email notifications** — admin notified on new issues; user notified on status changes and replies

### Admin Panel

#### Overview Tab
- 📊 **Stats cards** — total requests, pending, downloaded, users, Plex library size
- 📬 **Recent Requests** — scrollable card showing up to 50 recent requests with status badges
- 📋 **Recent Activity** — scrollable audit log with filter pills (All / Request / Issue / User / Settings / System / Auth)

#### Analytics Tab
- 📈 **30-day request trend** — bar chart of requests over time
- 🗂️ **Breakdown by type and status**
- 🏆 **Top requesters** and **most requested artists**

#### Other Tabs
- **Services** — Lidarr, Plex, API keys, Open in Plex setting
- **Requests** — request type toggles, global limits, approval settings
- **Users** — import Plex users, approve/promote/demote, per-user limit overrides
- **Notifications** — SMTP configuration, per-event email toggles
- **Metadata Providers** — Last.fm, Fanart.tv API keys
- **Account** — change local admin password

### Audit Log
Every action in Singarr is logged automatically:
- Requests submitted, approved, rejected, deleted
- Issues opened, status changed, resolved, deleted
- Users approved, promoted to admin, demoted, deleted
- Settings saved
- Plex library synced (with artist/album count)
- Admin login events

Admins see the full log. Plex users see only their own activity. Viewable from **Admin → Overview → Recent Activity**.

### Security
- Helmet middleware with security headers
- Auth endpoints rate-limited (20 requests per 15 minutes)
- Request body size limited to 1MB
- Sensitive settings (tokens, passwords, API keys) masked in API responses
- JWT secret warning on startup if using the default value
- nginx: X-Frame-Options, X-Content-Type-Options, Permissions-Policy headers

---

## Quick Start

### Portainer / Docker Compose

```yaml
version: '3.8'
services:
  singarr:
    image: rustypie/singarr:latest
    container_name: singarr
    restart: unless-stopped
    ports:
      - "8684:8684"
    environment:
      - JWT_SECRET=your_long_random_secret
      - PLEX_CLIENT_ID=singarr
      - APP_URL=http://your-server:8684
    volumes:
      - singarr-data:/app/data

volumes:
  singarr-data:
```

Open `http://your-server:8684` in your browser. **The first user to log in becomes the admin automatically.**

---

## API Keys

All API keys are configured inside the app under **Settings → Services** and **Settings → Metadata Providers**. No `.env` file required for normal use.

| Service | Where to get it | Required |
|---|---|---|
| Plex Token | Settings → Services → Plex | ✅ |
| Lidarr API Key | Lidarr → Settings → General | ✅ |
| Last.fm API Key | https://www.last.fm/api/account/create | Recommended |
| Fanart.tv API Key | https://fanart.tv/get-an-api-key | Recommended |

---

## Environment Variables

Only required if you prefer to configure via environment instead of the UI:

```env
# Security — generate with: openssl rand -hex 32
JWT_SECRET=your_long_random_secret

# Optional — can be set in UI instead
PLEX_URL=http://your-plex-server:32400
PLEX_TOKEN=your_plex_token
LIDARR_URL=http://your-lidarr-server:8686
LIDARR_API_KEY=your_lidarr_api_key
LASTFM_API_KEY=your_lastfm_key
FANART_API_KEY=your_fanart_key
```

---

## Admin Guide

### Request Approval
By default requests go straight to Lidarr. To require approval first, go to **Settings → Requests** and enable **Require Admin Approval**. Pending requests appear on the Requests page with Approve and Reject buttons visible only to admins. Rejecting opens a text box to optionally explain why — the reason is saved to the request and included in the notification email to the user.

### Request Limits
Album and track limits are configured separately under **Settings → Requests** (defaults: 10 albums / 20 tracks per 7 days). Per-user overrides are available in **Settings → Users**. Admins are exempt from all limits.

### User Management
Import Plex users directly from your Plex friends and home users list. Approve or reject new users, promote to admin, set custom request limits, and toggle auto-approval for new Plex users under Settings → Requests.

### Open in Plex
Configure under **Settings → Services → Open In Plex via**:
- **Plex Web** — opens `app.plex.tv` (works from anywhere)
- **Local Server** — opens your Plex server directly (faster on local network)
- **Both** — shows two buttons side by side

This setting only applies to the local admin account. All other Plex users always open via Plex Web regardless of this setting. Requires clicking **Test Connection** or running a **Sync Now** once to detect your Plex server's machine ID.

### Plex Library Sync
Singarr caches your Plex library to prevent duplicate requests and power quality badges. The sync runs automatically every minute and can be triggered manually from **Settings → Overview → Sync Now**. It populates artist and album metadata, MusicBrainz IDs, audio quality info, and genre tags.

### Audit Log
The full activity log lives on the **Overview** tab under **Recent Activity**. Filter by category using the pills at the top right of the card. Admins see all activity across all users; Plex users see only their own activity.

---

## Architecture

Single Docker container running:
- **nginx** on port 8684 — serves the React frontend and proxies API requests
- **Node.js** on port 3001 (internal) — Express API backend
- **SQLite** at `/app/data/singarr.db` — all data persisted in a Docker volume
- **supervisord** — manages nginx and Node.js processes

```
singarr/
├── Dockerfile
├── nginx.conf
├── supervisord.conf
├── backend/
│   └── src/
│       ├── server.js
│       ├── db.js
│       ├── routes/         # auth, requests, search, admin, plex, discover, issues
│       ├── services/       # lidarr, plex, limits, email, audit
│       └── middleware/
└── frontend/
    └── src/
        ├── pages/          # Home, Requests, Issues, Admin
        ├── components/     # Layout, RequestModal, StatusBadge, Icons
        └── contexts/       # AuthContext, ThemeContext
```

**Stack:** React · Vite · Framer Motion · Express · SQLite · nginx · supervisord  
**Metadata:** MusicBrainz · Cover Art Archive · Last.fm · Fanart.tv

---

## Updating

```bash
docker pull rustypie/singarr:latest
docker compose up -d
```

Your database is stored in a Docker volume and persists across updates.

---

## Troubleshooting

**Can't log in with Plex?**  
Check that your Plex URL and token are correct in Settings → Services.

**Requests not going to Lidarr?**  
Verify your Lidarr URL and API key. Make sure Lidarr has at least one quality profile and root folder configured. If admin approval is enabled, requests won't go to Lidarr until approved.

**No album art or artist images?**  
Check your Last.fm and Fanart.tv API keys in Settings → Metadata Providers. Run a Plex Library Sync after adding keys.

**Genre browsing not showing?**  
Genres are populated during a Plex Library Sync and require a valid Last.fm API key.

**Open in Plex buttons not appearing?**  
Click Test Connection on your Plex settings or run a Sync Now — this detects and stores your Plex server's machine ID which is required for the deep links.

**Lidarr marks download as wrong album?**  
This is usually a title mismatch between MusicBrainz and your indexer. Go to the album in Lidarr and use Interactive Search to see why results are being rejected. Check that Allow Fingerprinting is set to "For new imports" in Lidarr → Settings → Media Management.

**Check logs:**
```bash
docker logs singarr --tail=50
```
