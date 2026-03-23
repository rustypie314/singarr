import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext.jsx'
import RequestModal from '../components/RequestModal.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import LimitBar from '../components/LimitBar.jsx'
import { IconMicrophone, IconDisc, IconMusicNote, IconSearch, IconPlus, IconDownload, IconRefresh } from '../components/Icons.jsx'
import { TypeIcon } from '../components/Icons.jsx'
import toast from 'react-hot-toast'

const TABS = [
  { id: 'top',          label: 'Top Results'   },
  { id: 'artists',      label: 'Artists'       },
  { id: 'albums',       label: 'Albums'        },
  { id: 'eps',          label: 'EPs & Singles' },
  { id: 'compilations', label: 'Compilations'  },
  { id: 'live',         label: 'Live'          },
  { id: 'tracks',       label: 'Tracks'        },
]

function debounce(fn, delay) {
  let t
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay) }
}

// ── Horizontal scroll row ─────────────────────────────────
function ScrollRow({ title, items, renderCard, emptyMsg, loading }) {
  const rowRef = useRef(null)

  function scroll(dir) {
    if (rowRef.current) rowRef.current.scrollBy({ left: dir * 220, behavior: 'smooth' })
  }

  return (
    <div style={{ marginBottom: 36 }}>
      <div style={r.rowHeader}>
        <h2 style={r.rowTitle}>{title}</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => scroll(-1)} style={r.scrollBtn}>‹</button>
          <button onClick={() => scroll(1)}  style={r.scrollBtn}>›</button>
        </div>
      </div>

      {loading ? (
        <div style={r.scrollWrap}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={r.skeletonCard}>
              <div className="skeleton" style={{ width: '100%', aspectRatio: '1', borderRadius: 10, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 13, width: '70%', marginBottom: 5 }} />
              <div className="skeleton" style={{ height: 11, width: '50%' }} />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div style={r.emptyRow}>{emptyMsg}</div>
      ) : (
        <div ref={rowRef} style={r.scrollWrap}>
          {items.map((item, i) => renderCard(item, i))}
        </div>
      )}
    </div>
  )
}

// ── Library card (artist or album from Plex) ──────────────
function LibraryCard({ item, type, plexConfig }) {
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError]   = useState(false)
  const isArtist = type === 'artist'
  const imgSrc   = item.imageUrl || null

  const qualityLabel = item.quality === '24bit-flac' ? '24-bit FLAC'
                     : item.quality === '16bit-flac' ? '16-bit FLAC'
                     : item.quality === 'flac'       ? 'FLAC'
                     : null

  const badgeText = qualityLabel ? `✓ In Plex · ${qualityLabel}` : '✓ In Plex'
  const badgeColor = item.quality === '24bit-flac' ? { bg: 'rgba(24,95,165,0.85)', color: '#B5D4F4' }
                   : item.quality === '16bit-flac' ? { bg: 'rgba(15,110,86,0.85)', color: '#9FE1CB' }
                   : { bg: 'rgba(26,122,69,0.85)', color: '#fff' }

  // Build Open in Plex URLs
  const ratingKey = item.plex_rating_key
  const machineId = plexConfig?.machineId
  const openMode  = plexConfig?.openMode || 'both'
  const localUrl  = plexConfig?.localUrl?.replace(/\/$/, '')
  const detailPath = ratingKey && machineId ? `#!/server/${machineId}/details?key=%2Flibrary%2Fmetadata%2F${ratingKey}` : null
  const webLink   = detailPath ? `https://app.plex.tv/desktop/${detailPath}` : null
  const localLink = detailPath && localUrl ? `${localUrl}/web/index.html${detailPath}` : null
  const showOpenInPlex = !isArtist && detailPath && (openMode === 'web' || openMode === 'local' || openMode === 'both')

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.15 }}
      style={r.card}
    >
      <div style={{ ...r.cardArt, borderRadius: isArtist ? '50%' : 10, overflow: 'hidden' }}>
        {!imgLoaded && !imgError && imgSrc && <div className="skeleton" style={{ position: 'absolute', inset: 0, borderRadius: isArtist ? '50%' : 10 }} />}
        {imgSrc && !imgError
          ? <img src={imgSrc} alt={item.title} style={{ ...r.cardImg, opacity: imgLoaded ? 1 : 0, borderRadius: isArtist ? '50%' : 10 }}
              onLoad={() => setImgLoaded(true)} onError={() => setImgError(true)} loading="lazy" />
          : <div style={{ ...r.cardFallback, borderRadius: isArtist ? '50%' : 10,
              background: `linear-gradient(135deg, hsl(${(item.title?.charCodeAt(0) || 0) * 7 % 360},22%,18%), hsl(${((item.title?.charCodeAt(0) || 0) * 7 + 50) % 360},26%,22%))` }}>
              {isArtist ? <IconMicrophone size={32} color="rgba(255,255,255,0.2)" /> : <IconDisc size={32} color="rgba(255,255,255,0.2)" />}
            </div>
        }
      </div>
      <div style={r.cardTitle}>{item.title}</div>
      {item.artist_name && <div style={r.cardSub}>{item.artist_name}</div>}
      <div style={{ marginTop: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: badgeColor.bg, color: badgeColor.color, backdropFilter: 'blur(4px)', display: 'inline-block' }}>
          {badgeText}
        </span>
      </div>
      {showOpenInPlex && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          {(openMode === 'web' || openMode === 'both') && webLink && (
            <a href={webLink} target="_blank" rel="noreferrer"
              style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(229,160,13,0.12)', color: '#e5a00d', border: '1px solid rgba(229,160,13,0.3)', textDecoration: 'none', display: 'inline-block' }}>
              ▶ Plex Web
            </a>
          )}
          {(openMode === 'local' || openMode === 'both') && localLink && (
            <a href={localLink} target="_blank" rel="noreferrer"
              style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(79,156,249,0.12)', color: '#4f9cf9', border: '1px solid rgba(79,156,249,0.3)', textDecoration: 'none', display: 'inline-block' }}>
              ▶ Local
            </a>
          )}
        </div>
      )}
    </motion.div>
  )
}

// ── Request card ──────────────────────────────────────────
function RequestCard({ req, onRequest }) {
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError]   = useState(false)

  return (
    <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.15 }} style={r.card}>
      <div style={{ ...r.cardArt, borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
        {req.cover_url && !imgError
          ? <img src={req.cover_url} alt={req.title}
              style={{ ...r.cardImg, opacity: imgLoaded ? 1 : 0, borderRadius: 10 }}
              onLoad={() => setImgLoaded(true)} onError={() => setImgError(true)} loading="lazy" />
          : <div style={{ ...r.cardFallback, borderRadius: 10,
              background: `linear-gradient(135deg, hsl(${(req.title?.charCodeAt(0) || 0) * 9 % 360},22%,18%), hsl(${((req.title?.charCodeAt(0) || 0) * 9 + 50) % 360},26%,22%))` }}>
              <TypeIcon type={req.type} size={32} color="rgba(255,255,255,0.2)" />
            </div>
        }
      </div>
      <div style={r.cardTitle}>{req.title}</div>
      <div style={r.cardSub}>{req.artist_name || req.username}</div>
      <div style={{ marginTop: 4 }}>
        <StatusBadge status={req.status} size="sm" />
      </div>
    </motion.div>
  )
}

export default function Home() {
  const { api } = useAuth()

  // Search state
  const [tab, setTab]       = useState('top')
  const [query, setQuery]   = useState('')
  const [loading, setLoading] = useState(false)
  const [artists, setArtists] = useState([])
  const [albums,  setAlbums]  = useState([])
  const [eps,     setEps]     = useState([])
  const [comps,   setComps]   = useState([])
  const [live,    setLive]    = useState([])
  const [tracks,  setTracks]  = useState([])
  const [tabPages, setTabPages] = useState({ albums: 0, eps: 0, comps: 0, live: 0, tracks: 0, artists: 0 })
  const [selected, setSelected]         = useState(null)
  const [selectedType, setSelectedType] = useState(null)
  const [expandedAlbum, setExpandedAlbum] = useState(null)
  const [albumTracks, setAlbumTracks]     = useState({})
  const [expandedArtist, setExpandedArtist] = useState(null)
  const [artistAlbums, setArtistAlbums]     = useState({})
  const [artistAlbumPage, setArtistAlbumPage] = useState({})
  const [artistAlbumLoading, setArtistAlbumLoading] = useState(false)
  const [limitRefresh, setLimitRefresh]   = useState(0)

  // Discover state
  const [discover, setDiscover]           = useState(null)
  const [discoverLoading, setDiscoverLoading] = useState(true)

  useEffect(() => {
    setDiscoverLoading(true)
    api.get('/discover')
      .then(r => setDiscover(r.data))
      .catch(() => setDiscover(null))
      .finally(() => setDiscoverLoading(false))

    // Re-fetch plexConfig when user returns to the tab (catches setting changes)
    function onVisible() {
      if (document.visibilityState === 'visible') {
        api.get('/discover')
          .then(r => setDiscover(prev => prev ? { ...prev, plexConfig: r.data.plexConfig } : r.data))
          .catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const searchAll = useCallback(debounce(async (q) => {
    if (!q.trim() || q.length < 2) {
      setArtists([]); setAlbums([]); setEps([]); setComps([]); setLive([]); setTracks([])
      setLoading(false); return
    }
    try {
      const [a, al, ep, co, li, t] = await Promise.allSettled([
        api.get('/search/artists', { params: { q } }),
        api.get('/search/albums',  { params: { q, type: 'album' } }),
        api.get('/search/albums',  { params: { q, type: 'ep|single' } }),
        api.get('/search/albums',  { params: { q, type: 'compilation' } }),
        api.get('/search/albums',  { params: { q, type: 'live' } }),
        api.get('/search/tracks',  { params: { q } }),
      ])
      setArtists(a.status  === 'fulfilled' ? a.value.data.results  || [] : [])
      setAlbums( al.status === 'fulfilled' ? al.value.data.results || [] : [])
      setEps(    ep.status === 'fulfilled' ? ep.value.data.results || [] : [])
      setComps(  co.status === 'fulfilled' ? co.value.data.results || [] : [])
      setLive(   li.status === 'fulfilled' ? li.value.data.results || [] : [])
      setTracks( t.status  === 'fulfilled' ? t.value.data.results  || [] : [])
    } catch { toast.error('Search failed') }
    finally { setLoading(false) }
  }, 450), [api])

  function handleInput(e) {
    const v = e.target.value
    setQuery(v)
    setExpandedAlbum(null)
    setExpandedArtist(null)
    setEps([]); setComps([]); setLive([])
    setTabPages({ albums: 0, eps: 0, comps: 0, live: 0, tracks: 0, artists: 0 })
    setLoading(!!v.trim())
    searchAll(v)
  }

  async function loadAlbumTracks(albumId) {
    if (expandedAlbum === albumId) { setExpandedAlbum(null); return }
    if (albumTracks[albumId]) { setExpandedAlbum(albumId); return }
    try {
      const res = await api.get(`/search/album/${albumId}/tracks`)
      setAlbumTracks(prev => ({ ...prev, [albumId]: res.data.tracks || [] }))
      setExpandedAlbum(albumId)
    } catch { toast.error('Could not load tracks') }
  }

  async function loadArtistAlbums(artistId, artistName) {
    if (expandedArtist === artistId) { setExpandedArtist(null); return }
    if (artistAlbums[artistId]) { setExpandedArtist(artistId); return }
    setArtistAlbumLoading(true)
    try {
      const res = await api.get(`/search/artist/${artistId}/albums`, { params: { name: artistName } })
      setArtistAlbums(prev => ({ ...prev, [artistId]: res.data.albums || [] }))
      setArtistAlbumPage(prev => ({ ...prev, [artistId]: 0 }))
      setExpandedArtist(artistId)
    } catch { toast.error('Could not load albums') }
    finally { setArtistAlbumLoading(false) }
  }

  function requestItem(item, type) {
    if (item.inPlex)        return toast('Already in your Plex library', { icon: '📚' })
    if (item.requestStatus) return toast(`Already ${item.requestStatus}`)
    setSelected(item); setSelectedType(type)
  }

  const topResults = []
  if (artists[0]) topResults.push({ ...artists[0], _type: 'artist' })
  albums.slice(0, 4).forEach(a  => topResults.push({ ...a, _type: 'album'  }))
  tracks.slice(0, 4).forEach(t  => topResults.push({ ...t, _type: 'track'  }))
  artists.slice(1, 3).forEach(a => topResults.push({ ...a, _type: 'artist' }))

  const hasResults = artists.length > 0 || albums.length > 0 || eps.length > 0 || comps.length > 0 || live.length > 0 || tracks.length > 0
  const showDiscover = !query

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>Discover</h1>
          <p style={styles.pageSubtitle}>Search and request music for your Plex library</p>
        </div>
        <div style={styles.limitWrap}>
          <LimitBar key={limitRefresh} />
        </div>
      </div>

      {/* Search bar */}
      <div style={styles.searchWrap}>
        <IconSearch size={18} color="var(--text-muted)" style={{ flexShrink: 0 }} />
        <input
          style={styles.searchInput}
          placeholder="Search artists, albums or tracks…"
          value={query} onChange={handleInput} autoFocus
        />
        {loading && <span style={styles.spinner} />}
        {query && !loading && (
          <button style={styles.clearBtn} onClick={() => {
            setQuery(''); setArtists([]); setAlbums([]); setTracks([])
          }}>✕</button>
        )}
      </div>

      {/* ── Discover mode (no search query) ── */}
      <AnimatePresence mode="wait">
        {showDiscover && (
          <motion.div key="discover"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
          >
            {/* Library stats bar */}
            {discover?.stats && (discover.stats.totalArtists > 0 || discover.stats.totalAlbums > 0) && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={styles.statsBanner}>
                <div style={styles.statItem}>
                  <span style={styles.statNum}>{discover.stats.totalArtists.toLocaleString()}</span>
                  <span style={styles.statLabel}>Artists</span>
                </div>
                <div style={styles.statDivider} />
                <div style={styles.statItem}>
                  <span style={styles.statNum}>{discover.stats.totalAlbums.toLocaleString()}</span>
                  <span style={styles.statLabel}>Albums</span>
                </div>
                <div style={styles.statDivider} />
                <div style={styles.statItem}>
                  <span style={styles.statLabel}>
                    Last synced {discover.stats.lastSync
                      ? new Date(discover.stats.lastSync).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                      : 'never'}
                  </span>
                </div>
              </motion.div>
            )}

            {/* No library data yet */}
            {!discoverLoading && discover?.stats?.totalArtists === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={styles.noLibrary}>
                <IconDisc size={40} color="var(--text-muted)" style={{ opacity: 0.3 }} />
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Your Plex library hasn't synced yet</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Make sure your Plex URL and token are configured in <strong style={{ color: 'var(--text-secondary)' }}>Settings</strong>, then trigger a sync from <strong style={{ color: 'var(--text-secondary)' }}>Admin → Overview</strong>.
                  </div>
                </div>
              </motion.div>
            )}

            {/* Artists row */}
            {(discoverLoading || (discover?.artists?.length > 0)) && (
              <ScrollRow
                title="Artists currently in Plex"
                items={discover?.artists || []}
                loading={discoverLoading}
                emptyMsg="No artists in your Plex library yet"
                renderCard={(item, i) => (
                  <LibraryCard key={item.plex_rating_key || i} item={item} type="artist" />
                )}
              />
            )}

            {/* Albums row */}
            {(discoverLoading || (discover?.albums?.length > 0)) && (
              <ScrollRow
                title="Albums available for playback"
                items={discover?.albums || []}
                loading={discoverLoading}
                emptyMsg="No albums in your Plex library yet"
                renderCard={(item, i) => (
                  <LibraryCard key={item.plex_rating_key || i} item={item} type="album" plexConfig={discover?.plexConfig} />
                )}
              />
            )}

            {/* Recent requests row */}
            {(discoverLoading || (discover?.recentRequests?.length > 0)) && (
              <ScrollRow
                title="Recent requests"
                items={discover?.recentRequests || []}
                loading={discoverLoading}
                emptyMsg="No requests yet"
                renderCard={(req, i) => (
                  <RequestCard key={req.id || i} req={req} />
                )}
              />
            )}
          </motion.div>
        )}

        {/* ── Search mode ── */}
        {!showDiscover && (
          <motion.div key="search"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
          >
            {/* Tabs */}
            <AnimatePresence>
              {(hasResults || loading) && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={styles.tabBar}>
                  {TABS.map(t => (
                    <button key={t.id} onClick={() => { setTab(t.id); setTabPages(prev => ({ ...prev, [t.id]: 0 })) }} style={{
                      ...styles.tabBtn,
                      background: tab === t.id ? 'var(--text-primary)' : 'transparent',
                      color: tab === t.id ? 'var(--bg-base)' : 'var(--text-secondary)',
                      border: `1px solid ${tab === t.id ? 'var(--text-primary)' : 'var(--border-strong)'}`,
                    }}>
                      {t.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Loading */}
            {loading && !hasResults && (
              <div>
                {[...Array(6)].map((_, i) => (
                  <div key={i} style={styles.skeletonRow}>
                    <div className="skeleton" style={{ width: 52, height: 52, borderRadius: 8, flexShrink: 0 }} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div className="skeleton" style={{ height: 14, width: '40%' }} />
                      <div className="skeleton" style={{ height: 12, width: '25%' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* No results */}
            {!loading && !hasResults && query && (
              <div style={styles.emptyState}>
                <IconMusicNote size={40} color="var(--text-muted)" style={{ opacity: 0.2 }} />
                <p style={styles.emptyText}>No results for "{query}"</p>
              </div>
            )}

            {/* Top results */}
            {hasResults && tab === 'top' && topResults.map((item, i) =>
              item._type === 'album'
                ? <AlbumRow key={`${item.id}-${i}`} item={item} index={i}
                    expanded={expandedAlbum === item.id} tracks={albumTracks[item.id]}
                    onExpand={() => loadAlbumTracks(item.id)}
                    onRequestAlbum={() => requestItem(item, 'album')}
                    onRequestTrack={(t) => requestItem(t, 'track')}
                  />
                : item._type === 'artist'
                ? <ArtistRow key={`${item.id}-${i}`} item={item} index={i}
                    expanded={expandedArtist === item.id}
                    albums={artistAlbums[item.id]}
                    page={artistAlbumPage[item.id] || 0}
                    onSetPage={p => setArtistAlbumPage(prev => ({ ...prev, [item.id]: p }))}
                    onExpand={() => loadArtistAlbums(item.id, item.name)}
                    onRequestArtist={() => requestItem(item, 'artist')}
                    onRequestAlbum={(a) => requestItem(a, 'album')} api={api}
                  />
                : <ResultRow key={`${item.id}-${i}`} item={item} type={item._type} index={i}
                    onRequest={() => requestItem(item, item._type)}
                  />
            )}

            {/* Artists */}
            {hasResults && tab === 'artists' && (
              artists.length === 0
                ? <EmptyTab label="artists" />
                : <>
                    {artists.slice(tabPages.artists * 10, (tabPages.artists + 1) * 10).map((item, i) => (
                      <ArtistRow key={item.id} item={item} index={i}
                        expanded={expandedArtist === item.id}
                        albums={artistAlbums[item.id]}
                        page={artistAlbumPage[item.id] || 0}
                        onSetPage={p => setArtistAlbumPage(prev => ({ ...prev, [item.id]: p }))}
                        onExpand={() => loadArtistAlbums(item.id, item.name)}
                        onRequestArtist={() => requestItem(item, 'artist')}
                        onRequestAlbum={(a) => requestItem(a, 'album')} api={api}
                      />
                    ))}
                    <TabPager total={artists.length} page={tabPages.artists} onPage={p => setTabPages(prev => ({ ...prev, artists: p }))} />
                  </>
            )}

            {/* Albums */}
            {hasResults && tab === 'albums' && (
              albums.length === 0
                ? <EmptyTab label="albums" />
                : <>
                    {albums.slice(tabPages.albums * 10, (tabPages.albums + 1) * 10).map((item, i) => (
                      <AlbumRow key={item.id} item={item} index={i}
                        expanded={expandedAlbum === item.id} tracks={albumTracks[item.id]}
                        onExpand={() => loadAlbumTracks(item.id)}
                        onRequestAlbum={() => requestItem(item, 'album')}
                        onRequestTrack={(t) => requestItem(t, 'track')}
                      />
                    ))}
                    <TabPager total={albums.length} page={tabPages.albums} onPage={p => setTabPages(prev => ({ ...prev, albums: p }))} />
                  </>
            )}

            {/* Tracks */}
            {hasResults && tab === 'tracks' && (
              tracks.length === 0
                ? <EmptyTab label="tracks" />
                : <>
                    {tracks.slice(tabPages.tracks * 10, (tabPages.tracks + 1) * 10).map((item, i) => (
                      <ResultRow key={item.id} item={item} type="track" index={i} onRequest={() => requestItem(item, 'track')} />
                    ))}
                    <TabPager total={tracks.length} page={tabPages.tracks} onPage={p => setTabPages(prev => ({ ...prev, tracks: p }))} />
                  </>
            )}

            {/* EPs & Singles */}
            {hasResults && tab === 'eps' && (
              eps.length === 0
                ? <EmptyTab label="EPs & singles" />
                : <>
                    {eps.slice(tabPages.eps * 10, (tabPages.eps + 1) * 10).map((item, i) => (
                      <AlbumRow key={item.id} item={item} index={i}
                        expanded={expandedAlbum === item.id} tracks={albumTracks[item.id]}
                        onExpand={() => loadAlbumTracks(item.id)}
                        onRequestAlbum={() => requestItem(item, 'album')}
                        onRequestTrack={(t) => requestItem(t, 'track')}
                      />
                    ))}
                    <TabPager total={eps.length} page={tabPages.eps} onPage={p => setTabPages(prev => ({ ...prev, eps: p }))} />
                  </>
            )}

            {/* Compilations */}
            {hasResults && tab === 'compilations' && (
              comps.length === 0
                ? <EmptyTab label="compilations" />
                : <>
                    {comps.slice(tabPages.comps * 10, (tabPages.comps + 1) * 10).map((item, i) => (
                      <AlbumRow key={item.id} item={item} index={i}
                        expanded={expandedAlbum === item.id} tracks={albumTracks[item.id]}
                        onExpand={() => loadAlbumTracks(item.id)}
                        onRequestAlbum={() => requestItem(item, 'album')}
                        onRequestTrack={(t) => requestItem(t, 'track')}
                      />
                    ))}
                    <TabPager total={comps.length} page={tabPages.comps} onPage={p => setTabPages(prev => ({ ...prev, comps: p }))} />
                  </>
            )}

            {/* Live */}
            {hasResults && tab === 'live' && (
              live.length === 0
                ? <EmptyTab label="live albums" />
                : <>
                    {live.slice(tabPages.live * 10, (tabPages.live + 1) * 10).map((item, i) => (
                      <AlbumRow key={item.id} item={item} index={i}
                        expanded={expandedAlbum === item.id} tracks={albumTracks[item.id]}
                        onExpand={() => loadAlbumTracks(item.id)}
                        onRequestAlbum={() => requestItem(item, 'album')}
                        onRequestTrack={(t) => requestItem(t, 'track')}
                      />
                    ))}
                    <TabPager total={live.length} page={tabPages.live} onPage={p => setTabPages(prev => ({ ...prev, live: p }))} />
                  </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {selected && (
        <RequestModal
          item={selected} type={selectedType}
          onClose={() => { setSelected(null); setSelectedType(null) }}
          onSuccess={() => setLimitRefresh(n => n + 1)}
        />
      )}
    </div>
  )
}

/* ── Result row (artist / track) ─────────────────────────── */
function ResultRow({ item, type, index, onRequest }) {
  const [hovered, setHovered] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError]   = useState(false)
  const title     = type === 'artist' ? item.name : item.title
  const art       = item.coverUrl || item.thumbUrl
  const isBlocked = item.inPlex || item.requestStatus
  const isArtist  = type === 'artist'

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.025, duration: 0.2 }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ ...styles.row, background: hovered ? 'var(--bg-elevated)' : 'transparent', opacity: isBlocked ? 0.6 : 1 }}
    >
      <div style={{ ...styles.thumb, borderRadius: isArtist ? '50%' : 8, overflow: 'hidden', flexShrink: 0 }}>
        {!imgLoaded && !imgError && art && <div className="skeleton" style={{ position: 'absolute', inset: 0, borderRadius: isArtist ? '50%' : 8 }} />}
        {art && !imgError
          ? <img src={art} alt={title} style={{ ...styles.thumbImg, opacity: imgLoaded ? 1 : 0 }}
              onLoad={() => setImgLoaded(true)} onError={() => setImgError(true)} loading="lazy" />
          : <div style={{ ...styles.thumbFallback, borderRadius: isArtist ? '50%' : 8,
              background: `linear-gradient(135deg, hsl(${(title?.charCodeAt(0)||0)*7%360},22%,18%), hsl(${((title?.charCodeAt(0)||0)*7+50)%360},26%,22%))` }}>
              <TypeIcon type={type} size={22} color="rgba(255,255,255,0.2)" />
            </div>
        }
      </div>
      <div style={styles.rowInfo}>
        <div style={styles.rowTitle}>{title}</div>
        <div style={styles.rowMeta}>
          <span style={styles.rowType}>{type}</span>
          {type !== 'artist' && item.artistName && <><span style={styles.dot}>·</span><span style={styles.rowArtist}>{item.artistName}</span></>}
          {item.year && <><span style={styles.dot}>·</span><span style={styles.rowYear}>{item.year}</span></>}
        </div>
      </div>
      <div style={styles.rowRight}>
        {item.inPlex && <span style={styles.plexPill}>In Plex</span>}
        {item.requestStatus && <StatusBadge status={item.requestStatus} size="sm" />}
        {!isBlocked && hovered && (
          <motion.button initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
            onClick={e => { e.stopPropagation(); onRequest() }} style={styles.requestBtn}>
            <IconPlus size={13} color="#fff" />Request
          </motion.button>
        )}
      </div>
    </motion.div>
  )
}

/* ── Artist row with album expansion ────────────────────── */
const PAGE_SIZE = 10

function ArtistRow({ item, index, expanded, albums, page, onSetPage, onExpand, onRequestArtist, onRequestAlbum, api }) {
  const inPlex = item.inPlex
  const status = item.requestStatus
  const [expandedAlbum, setExpandedAlbum] = useState(null)
  const [albumTracks, setAlbumTracks] = useState({})

  async function loadTracks(albumId) {
    if (expandedAlbum === albumId) { setExpandedAlbum(null); return }
    if (albumTracks[albumId]) { setExpandedAlbum(albumId); return }
    try {
      const res = await api.get(`/search/album/${albumId}/tracks`)
      setAlbumTracks(prev => ({ ...prev, [albumId]: res.data.tracks || [] }))
      setExpandedAlbum(albumId)
    } catch { toast.error('Could not load tracks') }
  }

  function formatDuration(ms) {
    if (!ms) return ''
    const m = Math.floor(ms / 60000)
    const s = Math.floor((ms % 60000) / 1000)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }} style={{ marginBottom: 2 }}>
      {/* Main artist row */}
      <div onClick={onExpand} style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
        borderRadius: expanded ? '10px 10px 0 0' : 10,
        background: expanded ? 'var(--bg-elevated)' : 'transparent',
        border: `1px solid ${expanded ? 'var(--border)' : 'transparent'}`,
        borderBottom: expanded ? 'none' : undefined,
        cursor: 'pointer', transition: 'background 150ms',
      }}>
        {item.thumbUrl
          ? <img src={item.thumbUrl} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
          : <div style={{ width: 48, height: 48, borderRadius: 8, background: 'var(--bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20 }}>🎤</div>
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
            {inPlex && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999, background: 'rgba(26,122,69,0.15)', color: 'var(--accent)', flexShrink: 0 }}>✓ In Plex</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Artist{item.disambiguation ? ` · ${item.disambiguation}` : ''}{item.country ? ` · ${item.country}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {status
            ? <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: 'var(--bg-overlay)', color: 'var(--accent)' }}>{status}</span>
            : !inPlex && <button onClick={onRequestArtist} style={{ padding: '6px 13px', background: 'var(--accent)', border: 'none', borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>Request</button>
          }
          <span style={{ fontSize: 18, color: 'var(--text-muted)', lineHeight: 1, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>⌄</span>
        </div>
      </div>

      {/* Albums panel */}
      {expanded && (
        <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 10px 10px', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
          {!albums ? (
            <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
              <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.15)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block', flexShrink: 0 }} />
              Loading albums…
            </div>
          ) : albums.length === 0 ? (
            <div style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: 13 }}>No albums found</div>
          ) : (
            <>
              {albums.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((album, ai) => {
                const isAlbumExpanded = expandedAlbum === album.id
                const tracks = albumTracks[album.id]
                const isLast = ai === Math.min(PAGE_SIZE, albums.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).length) - 1
                return (
                  <div key={album.id}>
                    {/* Album row */}
                    <div onClick={() => loadTracks(album.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
                      borderBottom: (isAlbumExpanded || !isLast) ? '1px solid var(--border)' : 'none',
                      cursor: 'pointer',
                      background: isAlbumExpanded ? 'rgba(255,255,255,0.03)' : 'transparent',
                      transition: 'background 120ms',
                    }}>
                      {album.coverUrl
                        ? <img src={album.coverUrl} alt="" style={{ width: 38, height: 38, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                        : <div style={{ width: 38, height: 38, borderRadius: 6, background: 'var(--bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>💿</div>
                      }
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{album.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{album.type}{album.year ? ` · ${album.year}` : ''}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        {album.inPlex
                          ? (() => {
                              const ql = album.quality === '24bit-flac' ? '24-bit FLAC'
                                       : album.quality === '16bit-flac' ? '16-bit FLAC'
                                       : album.quality === 'flac'       ? 'FLAC' : null
                              const bg = album.quality === '24bit-flac' ? 'rgba(24,95,165,0.15)'
                                       : album.quality === '16bit-flac' ? 'rgba(15,110,86,0.15)'
                                       : 'rgba(26,122,69,0.15)'
                              const color = album.quality === '24bit-flac' ? '#4f9cf9'
                                          : album.quality === '16bit-flac' ? '#2dbe6c'
                                          : 'var(--accent)'
                              const border = album.quality === '24bit-flac' ? 'rgba(24,95,165,0.3)'
                                           : album.quality === '16bit-flac' ? 'rgba(15,110,86,0.3)'
                                           : 'rgba(26,122,69,0.3)'
                              return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: bg, color, border: `1px solid ${border}` }}>
                                {ql ? `✓ In Plex · ${ql}` : '✓ In Plex'}
                              </span>
                            })()
                          : album.requestStatus
                          ? <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'var(--bg-overlay)', color: 'var(--accent)' }}>{album.requestStatus}</span>
                          : <button onClick={() => onRequestAlbum({ ...album, artistName: item.name })}
                              style={{ padding: '5px 11px', background: 'var(--accent-muted)', border: '1px solid var(--accent)', borderRadius: 6, color: 'var(--accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                              Request
                            </button>
                        }
                      </div>
                      <span style={{ fontSize: 16, color: 'var(--text-muted)', lineHeight: 1, marginLeft: 4, transform: isAlbumExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>⌄</span>
                    </div>

                    {/* Tracks panel */}
                    {isAlbumExpanded && (
                      <div style={{ background: 'rgba(0,0,0,0.2)', borderBottom: isLast ? 'none' : '1px solid var(--border)' }}>
                        {!tracks ? (
                          <div style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 12 }}>
                            <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.15)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block', flexShrink: 0 }} />
                            Loading tracks…
                          </div>
                        ) : tracks.length === 0 ? (
                          <div style={{ padding: '10px 20px', color: 'var(--text-muted)', fontSize: 12 }}>No tracks found</div>
                        ) : tracks.map((track, ti) => (
                          <div key={track.id || ti} style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '7px 20px',
                            borderBottom: ti < tracks.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                          }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 22, textAlign: 'right', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>{track.number || ti + 1}</span>
                            <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</span>
                            {track.duration && <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>{formatDuration(track.duration)}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Pagination */}
              {albums.length > PAGE_SIZE && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, albums.length)} of {albums.length}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { onSetPage(page - 1); setExpandedAlbum(null) }} disabled={page === 0}
                      style={{ padding: '5px 12px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: page === 0 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: page === 0 ? 'default' : 'pointer', fontSize: 13, opacity: page === 0 ? 0.4 : 1 }}>
                      ‹ Prev
                    </button>
                    <button onClick={() => { onSetPage(page + 1); setExpandedAlbum(null) }} disabled={(page + 1) * PAGE_SIZE >= albums.length}
                      style={{ padding: '5px 12px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: (page + 1) * PAGE_SIZE >= albums.length ? 'var(--text-muted)' : 'var(--text-primary)', cursor: (page + 1) * PAGE_SIZE >= albums.length ? 'default' : 'pointer', fontSize: 13, opacity: (page + 1) * PAGE_SIZE >= albums.length ? 0.4 : 1 }}>
                      Next ›
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </motion.div>
  )
}



/* ── Album row with tracklist ────────────────────────────── */
function AlbumRow({ item, index, expanded, tracks, onExpand, onRequestAlbum, onRequestTrack }) {
  const [hovered, setHovered] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError]   = useState(false)
  const isBlocked = item.inPlex || item.requestStatus

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.025, duration: 0.2 }}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onClick={onExpand}
        style={{ ...styles.row, cursor: 'pointer', background: hovered || expanded ? 'var(--bg-elevated)' : 'transparent', opacity: isBlocked ? 0.6 : 1 }}
      >
        <div style={{ ...styles.thumb, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
          {!imgLoaded && !imgError && item.coverUrl && <div className="skeleton" style={{ position: 'absolute', inset: 0, borderRadius: 8 }} />}
          {item.coverUrl && !imgError
            ? <img src={item.coverUrl} alt={item.title} style={{ ...styles.thumbImg, opacity: imgLoaded ? 1 : 0 }}
                onLoad={() => setImgLoaded(true)} onError={() => setImgError(true)} loading="lazy" />
            : <div style={{ ...styles.thumbFallback, borderRadius: 8,
                background: `linear-gradient(135deg, hsl(${(item.title?.charCodeAt(0)||0)*11%360},22%,18%), hsl(${((item.title?.charCodeAt(0)||0)*11+50)%360},26%,22%))` }}>
                <IconDisc size={22} color="rgba(255,255,255,0.2)" />
              </div>
          }
        </div>
        <div style={styles.rowInfo}>
          <div style={styles.rowTitle}>{item.title}</div>
          <div style={styles.rowMeta}>
            <span style={styles.rowType}>album</span>
            {item.artistName && <><span style={styles.dot}>·</span><span style={styles.rowArtist}>{item.artistName}</span></>}
            {item.year && <><span style={styles.dot}>·</span><span style={styles.rowYear}>{item.year}</span></>}
          </div>
        </div>
        <div style={styles.rowRight}>
          {item.inPlex && (() => {
            const ql = item.quality === '24bit-flac' ? '24-bit FLAC'
                     : item.quality === '16bit-flac' ? '16-bit FLAC'
                     : item.quality === 'flac'       ? 'FLAC' : null
            const bg = item.quality === '24bit-flac' ? 'rgba(24,95,165,0.15)'
                     : item.quality === '16bit-flac' ? 'rgba(15,110,86,0.15)'
                     : 'rgba(26,122,69,0.15)'
            const color = item.quality === '24bit-flac' ? '#4f9cf9'
                        : item.quality === '16bit-flac' ? '#2dbe6c'
                        : 'var(--accent)'
            const border = item.quality === '24bit-flac' ? 'rgba(24,95,165,0.3)'
                         : item.quality === '16bit-flac' ? 'rgba(15,110,86,0.3)'
                         : 'rgba(26,122,69,0.3)'
            return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: bg, color, border: `1px solid ${border}` }}>
              {ql ? `✓ In Plex · ${ql}` : 'In Plex'}
            </span>
          })()}
          {item.requestStatus && <StatusBadge status={item.requestStatus} size="sm" />}
          {!isBlocked && hovered && (
            <motion.button initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
              onClick={e => { e.stopPropagation(); onRequestAlbum() }} style={styles.requestBtn}>
              <IconDownload size={13} color="#fff" />Album
            </motion.button>
          )}
          <span style={{ ...styles.chevron, transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
        </div>
      </motion.div>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} style={styles.trackList}>
            {!tracks
              ? <div style={styles.trackLoading}><span style={styles.spinner} />Loading tracks…</div>
              : tracks.length === 0
              ? <div style={styles.trackLoading}>No tracks found</div>
              : tracks.map((track, ti) => (
                  <TrackRow key={track.id || ti} track={track} index={ti}
                    onRequest={() => onRequestTrack({ ...track, artistName: item.artistName, coverUrl: item.coverUrl })}
                  />
                ))
            }
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── Track row ───────────────────────────────────────────── */
function TrackRow({ track, index, onRequest }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ ...styles.trackRow, background: hovered ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
      <span style={styles.trackNum}>{index + 1}</span>
      <IconMusicNote size={12} color="var(--accent)" style={{ flexShrink: 0 }} />
      <span style={styles.trackTitle}>{track.title}</span>
      {track.duration && (
        <span style={styles.trackDur}>
          {Math.floor(track.duration / 60000)}:{String(Math.floor((track.duration % 60000) / 1000)).padStart(2, '0')}
        </span>
      )}
      <AnimatePresence>
        {hovered && (
          <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
            onClick={onRequest} style={styles.trackReqBtn}>
            <IconPlus size={11} color="var(--accent)" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── Tab pagination controls ─────────────────────────────── */
function TabPager({ total, page, onPage }) {
  const PAGE_SIZE = 10
  if (total <= PAGE_SIZE) return null
  const totalPages = Math.ceil(total / PAGE_SIZE)
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 4px', marginTop: 4, borderTop: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onPage(page - 1)} disabled={page === 0}
          style={{ padding: '5px 14px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: page === 0 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: page === 0 ? 'default' : 'pointer', fontSize: 13, opacity: page === 0 ? 0.4 : 1, fontFamily: 'var(--font-sans)' }}>
          ‹ Prev
        </button>
        <button onClick={() => onPage(page + 1)} disabled={page >= totalPages - 1}
          style={{ padding: '5px 14px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: page >= totalPages - 1 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: page >= totalPages - 1 ? 'default' : 'pointer', fontSize: 13, opacity: page >= totalPages - 1 ? 0.4 : 1, fontFamily: 'var(--font-sans)' }}>
          Next ›
        </button>
      </div>
    </div>
  )
}

function EmptyTab({ label }) {
  return <div style={styles.emptyState}><p style={styles.emptyText}>No {label} matched your search</p></div>
}

// ── Scroll row styles (r = row styles) ────────────────────
const r = {
  rowHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  rowTitle: { fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.2px' },
  scrollBtn: {
    width: 28, height: 28, borderRadius: '50%',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    color: 'var(--text-secondary)', fontSize: 16, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'var(--transition)', lineHeight: 1,
  },
  scrollWrap: {
    display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8,
    scrollbarWidth: 'none', msOverflowStyle: 'none',
    WebkitOverflowScrolling: 'touch',
  },
  skeletonCard: { width: 'clamp(130px, 30vw, 160px)', flexShrink: 0, display: 'flex', flexDirection: 'column' },
  emptyRow: { fontSize: 13, color: 'var(--text-muted)', padding: '20px 0' },

  card: {
    width: 'clamp(130px, 30vw, 160px)', flexShrink: 0, cursor: 'default',
  },
  cardArt: {
    width: '100%', aspectRatio: '1', position: 'relative',
    background: 'var(--bg-overlay)', marginBottom: 10,
  },
  cardImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'opacity 250ms' },
  cardFallback: {
    width: '100%', height: '100%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  plexBadge: {
    position: 'absolute', bottom: 6, right: 6,
    background: 'rgba(26,122,69,0.85)', color: '#fff',
    fontSize: 9, fontWeight: 700, padding: '2px 7px',
    borderRadius: 999, backdropFilter: 'blur(4px)',
  },
  cardTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardSub:   { fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 },
}

const styles = {
  root: { padding: '24px', maxWidth: '900px', margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', gap: '20px', flexWrap: 'wrap' },
  pageTitle:    { fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' },
  pageSubtitle: { fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' },
  limitWrap:    { minWidth: '200px', maxWidth: '260px', flex: 1 },
  searchWrap: {
    display: 'flex', alignItems: 'center', gap: '12px', padding: '0 18px',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: '999px', marginBottom: '20px', transition: 'border-color var(--transition)',
  },
  searchInput: {
    flex: 1, padding: '15px 0', background: 'none', border: 'none', outline: 'none',
    fontSize: '16px', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)',
  },
  spinner: {
    width: '16px', height: '16px', flexShrink: 0,
    border: '2px solid var(--border-strong)', borderTopColor: 'var(--accent)',
    borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block',
  },
  clearBtn: { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px', padding: '4px', flexShrink: 0 },

  statsBanner: {
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '12px 18px', marginBottom: 28,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
  },
  statItem:    { display: 'flex', alignItems: 'center', gap: 8 },
  statNum:     { fontSize: 16, fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--font-mono)' },
  statLabel:   { fontSize: 12, color: 'var(--text-muted)' },
  statDivider: { width: 1, height: 20, background: 'var(--border)' },

  noLibrary: {
    display: 'flex', alignItems: 'flex-start', gap: 16,
    padding: '24px', marginBottom: 32,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
  },

  tabBar:  { display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' },
  tabBtn:  { padding: '7px 18px', borderRadius: '999px', fontSize: '13px', fontWeight: '600', fontFamily: 'var(--font-sans)', cursor: 'pointer', transition: 'all var(--transition)', whiteSpace: 'nowrap' },
  results: { minHeight: '300px' },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: '12px' },
  emptyText:  { fontSize: '15px', color: 'var(--text-muted)' },
  skeletonRow: { display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 12px', marginBottom: '4px' },

  row: { display: 'flex', alignItems: 'center', gap: '14px', padding: '8px 12px', borderRadius: '8px', transition: 'background var(--transition)' },
  thumb: { width: '52px', height: '52px', position: 'relative', background: 'var(--bg-overlay)' },
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'opacity 250ms' },
  thumbFallback: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  rowInfo:   { flex: 1, minWidth: 0 },
  rowTitle:  { fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowMeta:   { display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px', flexWrap: 'wrap' },
  rowType:   { fontSize: '12px', color: 'var(--accent)', fontWeight: '600', textTransform: 'capitalize' },
  rowArtist: { fontSize: '12px', color: 'var(--text-secondary)' },
  rowYear:   { fontSize: '12px', color: 'var(--text-muted)' },
  dot:       { fontSize: '12px', color: 'var(--text-muted)' },
  rowRight:  { display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 },
  plexPill:  { padding: '3px 9px', background: 'rgba(229,160,13,0.15)', color: '#c97e00', fontSize: '11px', fontWeight: '700', borderRadius: '999px', border: '1px solid rgba(229,160,13,0.3)' },
  requestBtn: { display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 14px', background: 'var(--accent)', border: 'none', borderRadius: '999px', color: '#fff', fontSize: '12px', fontWeight: '700', fontFamily: 'var(--font-sans)', cursor: 'pointer', whiteSpace: 'nowrap' },
  chevron: { fontSize: '14px', color: 'var(--text-muted)', transition: 'transform 200ms ease', userSelect: 'none' },

  trackList:   { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderTop: 'none', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px', overflow: 'hidden' },
  trackLoading: { display: 'flex', alignItems: 'center', gap: '10px', padding: '16px', fontSize: '13px', color: 'var(--text-muted)', justifyContent: 'center' },
  trackRow:    { display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 16px', transition: 'background var(--transition)' },
  trackNum:    { fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', width: '18px', textAlign: 'right', flexShrink: 0 },
  trackTitle:  { flex: 1, fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  trackDur:    { fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 },
  trackReqBtn: { width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0, background: 'var(--accent-muted)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
}
