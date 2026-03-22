# 🎵 Singarr

Singarr is an Overseerr-style music request app for Plex + Lidarr. Users log in with their Plex account and can request artists, albums, or tracks. Requests are automatically sent to Lidarr for acquisition.

---

## Features

- 🔐 **Plex OAuth login** — users sign in with their Plex account
- 🎵 **Request artists, albums, or tracks** — each type can be toggled on/off by admins
- 📚 **Plex library awareness** — prevents requesting content already in your library
- 🚦 **Request limits** — global limits + per-user overrides, just like Overseerr
- 📊 **Status tracking** — pending → found → downloading → downloaded
- ⚙️ **Admin panel** — manage users, settings, and all requests
- 🎨 **Dark & light themes** — smooth, polished UI
- 🐳 **Docker Compose** — one command to run everything

---

## Quick Start

### 1. Clone and configure

```bash
git clone <your-repo>
cd singarr
cp .env.example .env
```

Edit `.env` with your values (see below).

### 2. Get your API keys

| Service | Where to get it | Required |
|---|---|---|
| Plex Token | https://support.plex.tv/articles/204059436 | ✅ |
| Lidarr API Key | Lidarr → Settings → General | ✅ |
| Last.fm API Key | https://www.last.fm/api/account/create | ✅ |
| Fanart.tv API Key | https://fanart.tv/get-an-api-key | ✅ |

### 3. Launch

```bash
docker-compose up -d
```

Open http://localhost:3000 in your browser.

**The first user to log in becomes the admin automatically.**

---

## Configuration (.env)

```env
# Security — generate with: openssl rand -hex 32
JWT_SECRET=your_long_random_secret

# Plex
PLEX_URL=http://192.168.1.100:32400
PLEX_TOKEN=your_plex_token

# Lidarr
LIDARR_URL=http://192.168.1.100:8686
LIDARR_API_KEY=your_lidarr_api_key

# Metadata
LASTFM_API_KEY=your_lastfm_key
FANART_API_KEY=your_fanart_key
```

---

## Admin Guide

### Request Type Toggles
Go to Admin → Settings to enable/disable artist, album, or track requests independently.

### Request Limits
- **Global limit**: applies to all users by default (e.g. 10 requests per 7 days)
- **Per-user override**: set in Admin → Users — overrides the global limit for that user
- Admins have no limits

### User Management
- **Approve/reject** new users if auto-approval is disabled
- **Promote to admin** any user
- **Set custom request limits** per user

### Plex Library Sync
Singarr caches your Plex music library hourly to detect duplicates. Trigger a manual sync from Admin → Overview → Sync Now.

---

## Architecture

```
singarr/
├── docker-compose.yml
├── .env.example
├── backend/          # Node.js + Express API
│   └── src/
│       ├── server.js
│       ├── db.js           # SQLite via better-sqlite3
│       ├── routes/         # auth, requests, search, admin, plex
│       ├── services/       # lidarr, plex, limits
│       └── middleware/     # auth, admin guards
└── frontend/         # React + Framer Motion
    └── src/
        ├── pages/          # Login, Home, Requests, Admin
        ├── components/     # Layout, StatusBadge, RequestModal, etc.
        └── contexts/       # AuthContext, ThemeContext
```

**Stack:** React · Framer Motion · Express · SQLite · Docker Compose  
**Metadata:** MusicBrainz · Cover Art Archive · Last.fm · Fanart.tv

---

## Updating

```bash
docker-compose pull
docker-compose up -d --build
```

Your database is stored in a Docker volume and will persist across updates.

---

## Troubleshooting

**Can't log in with Plex?**  
Check that `PLEX_URL` and `PLEX_TOKEN` are correct in your `.env`.

**Requests not going to Lidarr?**  
Verify `LIDARR_URL` and `LIDARR_API_KEY`. Make sure Lidarr has at least one quality profile and root folder configured.

**No album art showing?**  
Check your `LASTFM_API_KEY` and `FANART_API_KEY` values.

**Plex library not syncing?**  
Trigger a manual sync from Admin → Overview. Check backend logs: `docker-compose logs backend`.
