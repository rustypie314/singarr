import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext.jsx'

function formatDuration(ms) {
  if (!ms) return ''
  const totalSecs = Math.floor(ms / 1000)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default function AlbumTooltip({ mbid, children, onRequestTrack, disabled }) {
  const { api } = useAuth()
  const [visible, setVisible] = useState(false)
  const [tracks, setTracks] = useState(null)
  const [loading, setLoading] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, side: 'right' })
  const cacheRef = useRef({})
  const cardRef = useRef(null)
  const tooltipRef = useRef(null)
  const hideTimer = useRef(null)
  const showTimer = useRef(null)

  const fetchTracks = useCallback(async () => {
    if (!mbid) return
    if (cacheRef.current[mbid]) {
      setTracks(cacheRef.current[mbid])
      return
    }
    setLoading(true)
    try {
      const res = await api.get(`/search/album/${mbid}/tracks`)
      const data = res.data.tracks || []
      cacheRef.current[mbid] = data
      setTracks(data)
    } catch {
      setTracks([])
    } finally {
      setLoading(false)
    }
  }, [mbid, api])

  function computePosition() {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const vpW = window.innerWidth
    const vpH = window.innerHeight
    const tooltipW = 280
    const tooltipH = 320

    // Prefer right side, fall back to left
    const spaceRight = vpW - rect.right
    const spaceLeft = rect.left
    const side = spaceRight >= tooltipW + 12 ? 'right'
               : spaceLeft >= tooltipW + 12  ? 'left'
               : 'right'

    // Vertical: align top of tooltip with top of card, clamp to viewport
    let top = rect.top
    if (top + tooltipH > vpH - 16) top = vpH - tooltipH - 16
    if (top < 8) top = 8

    let left = side === 'right'
      ? rect.right + 10
      : rect.left - tooltipW - 10

    setPos({ top, left, side })
  }

  function handleMouseEnter() {
    clearTimeout(hideTimer.current)
    showTimer.current = setTimeout(() => {
      computePosition()
      setVisible(true)
      fetchTracks()
    }, 350) // slight delay so fast movers don't trigger
  }

  function handleMouseLeave() {
    clearTimeout(showTimer.current)
    hideTimer.current = setTimeout(() => setVisible(false), 200)
  }

  function handleTooltipEnter() {
    clearTimeout(hideTimer.current)
  }
  function handleTooltipLeave() {
    hideTimer.current = setTimeout(() => setVisible(false), 150)
  }

  useEffect(() => () => {
    clearTimeout(showTimer.current)
    clearTimeout(hideTimer.current)
  }, [])

  if (disabled) return children

  return (
    <>
      <div
        ref={cardRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'contents' }}
      >
        {children}
      </div>

      <AnimatePresence>
        {visible && (
          <motion.div
            ref={tooltipRef}
            initial={{ opacity: 0, scale: 0.95, x: pos.side === 'right' ? -8 : 8 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.95, x: pos.side === 'right' ? -8 : 8 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            onMouseEnter={handleTooltipEnter}
            onMouseLeave={handleTooltipLeave}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: '280px',
              zIndex: 2000,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 16px 48px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.2)',
              overflow: 'hidden',
              pointerEvents: 'auto',
            }}
          >
            {/* Header */}
            <div style={styles.header}>
              <span style={styles.headerLabel}>Tracklist</span>
              {tracks && <span style={styles.headerCount}>{tracks.length} tracks</span>}
            </div>

            {/* Track list */}
            <div style={styles.trackList}>
              {loading && (
                <div style={styles.loadingWrap}>
                  {[...Array(5)].map((_, i) => (
                    <div key={i} style={styles.skeletonRow}>
                      <div className="skeleton" style={{ width: '20px', height: '11px' }} />
                      <div className="skeleton" style={{ flex: 1, height: '11px' }} />
                      <div className="skeleton" style={{ width: '30px', height: '11px' }} />
                    </div>
                  ))}
                </div>
              )}

              {!loading && tracks?.length === 0 && (
                <div style={styles.emptyTracks}>Track info unavailable</div>
              )}

              {!loading && tracks?.map((track, i) => (
                <motion.div
                  key={track.id || i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  style={styles.trackRow}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={styles.trackNum}>{track.number || i + 1}</span>
                  <span style={styles.trackTitle}>{track.title}</span>
                  <div style={styles.trackRight}>
                    {track.duration && (
                      <span style={styles.trackDur}>{formatDuration(track.duration)}</span>
                    )}
                    {onRequestTrack && (
                      <button
                        style={styles.trackReqBtn}
                        onClick={e => { e.stopPropagation(); onRequestTrack(track) }}
                        title="Request this track"
                      >+</button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

const styles = {
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 14px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-overlay)',
  },
  headerLabel: {
    fontSize: '11px', fontWeight: '700',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase', letterSpacing: '0.06em',
  },
  headerCount: {
    fontSize: '11px', color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
  },
  trackList: {
    maxHeight: '280px',
    overflowY: 'auto',
    padding: '4px 0',
  },
  loadingWrap: { padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '10px' },
  skeletonRow: { display: 'flex', gap: '8px', alignItems: 'center' },
  emptyTracks: {
    padding: '20px 14px',
    fontSize: '12px', color: 'var(--text-muted)',
    textAlign: 'center',
  },
  trackRow: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '6px 14px',
    cursor: 'default',
    transition: 'background 120ms',
    borderRadius: '0',
  },
  trackNum: {
    fontSize: '11px', color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    width: '18px', textAlign: 'right', flexShrink: 0,
  },
  trackTitle: {
    flex: 1, fontSize: '12px', color: 'var(--text-primary)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    lineHeight: 1.4,
  },
  trackRight: {
    display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
  },
  trackDur: {
    fontSize: '11px', color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
  },
  trackReqBtn: {
    width: '18px', height: '18px',
    background: 'var(--accent-muted)',
    border: '1px solid var(--accent)',
    borderRadius: '50%',
    color: 'var(--accent)',
    fontSize: '13px', fontWeight: '700',
    cursor: 'pointer', lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 0, flexShrink: 0,
    transition: 'var(--transition)',
  },
}
