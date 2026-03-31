import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext.jsx'
import toast from 'react-hot-toast'

export default function RequestModal({ item, type, onClose, onSuccess }) {
  const { api, user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [similar, setSimilar] = useState([])
  const [requiresApproval, setRequiresApproval] = useState(false)

  useEffect(() => {
    if (!item) return
    // Pre-fetch similar artists for artist requests
    if (type === 'artist' && item.id) {
      api.get(`/search/artist/${item.id}`, { params: { name: item.name } })
        .then(r => setSimilar(r.data.similar || []))
        .catch(() => {})
    }
    // Check if admin approval is required (non-admins only)
    if (!user?.isAdmin) {
      api.get('/requests/settings')
        .then(r => {
          const needsApproval = r.data.requireApproval === 'true'
          const autoApprove = r.data.autoApprovePlexUsers === 'true'
          setRequiresApproval(needsApproval && !autoApprove)
        })
        .catch(() => {})
    }
  }, [item?.id])

  if (!item) return null

  async function handleRequest() {
    setLoading(true)
    try {
      await api.post('/requests', {
        type,
        musicbrainzId: item.id,
        title: type === 'artist' ? item.name : item.title,
        artistName: item.artistName || null,
        coverUrl: item.coverUrl || item.thumbUrl || null,
      })
      toast.success('Request submitted!')
      onSuccess?.()
      if (type === 'artist' && similar.length > 0) {
        setSubmitted(true)
        setLoading(false)
      } else {
        onClose()
      }
    } catch (e) {
      const msg = e.response?.data?.error || 'Request failed'
      if (e.response?.data?.inPlex) {
        toast('Already in your Plex library!', { icon: '📚' })
      } else {
        toast.error(msg)
      }
      setLoading(false)
    }
  }

  const title = type === 'artist' ? item.name : item.title
  const art = item.coverUrl || item.thumbUrl

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={styles.overlay}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          style={styles.modal}
          onClick={e => e.stopPropagation()}
        >
          {/* Art header */}
          {art && (
            <div style={{ ...styles.artBg, backgroundImage: `url(${art})` }}>
              <div style={styles.artOverlay} />
            </div>
          )}

          <div style={styles.body}>
            {!submitted ? (
              <>
                <div style={styles.typeTag}>{type}</div>
                <h2 style={styles.title}>{title}</h2>
                {item.artistName && type !== 'artist' && (
                  <p style={styles.artist}>{item.artistName}</p>
                )}
                {item.year && <p style={styles.meta}>{item.year}</p>}
                {item.disambiguation && (
                  <p style={styles.meta}>{item.disambiguation}</p>
                )}

                <p style={styles.confirmText}>
                  Add this {type} to your music library?
                  {requiresApproval && (
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                      ⏳ Requires admin approval.
                    </span>
                  )}
                </p>

                <div style={styles.actions}>
                  <button onClick={onClose} style={styles.cancelBtn}>Cancel</button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleRequest}
                    disabled={loading}
                    style={{ ...styles.confirmBtn, opacity: loading ? 0.7 : 1 }}
                  >
                    {loading ? 'Requesting…' : 'Request'}
                  </motion.button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <span style={{ fontSize: 20 }}>✓</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>Request submitted!</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>You might also like these similar artists:</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                  {similar.map((name, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-overlay)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{name}</span>
                    </div>
                  ))}
                </div>
                <button onClick={onClose} style={{ ...styles.confirmBtn, width: '100%' }}>Done</button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    zIndex: 1000, padding: '0',
  },
  modal: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
    width: '100%', maxWidth: '480px',
    overflow: 'hidden',
    boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
  },
  artBg: {
    height: '160px',
    backgroundSize: 'cover', backgroundPosition: 'center',
    position: 'relative',
  },
  artOverlay: {
    position: 'absolute', inset: 0,
    background: 'linear-gradient(to bottom, transparent 40%, var(--bg-elevated))',
  },
  body: { padding: '24px' },
  typeTag: {
    display: 'inline-block',
    padding: '3px 10px',
    background: 'var(--accent-muted)',
    color: 'var(--accent)',
    borderRadius: '999px',
    fontSize: '11px', fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    marginBottom: '8px',
  },
  title: {
    fontSize: '22px', fontWeight: '800',
    color: 'var(--text-primary)', lineHeight: 1.2,
    marginBottom: '4px',
  },
  artist: { fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '2px' },
  meta: { fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' },
  confirmText: {
    fontSize: '14px', color: 'var(--text-secondary)',
    marginTop: '16px', marginBottom: '20px',
  },
  actions: { display: 'flex', gap: '10px' },
  cancelBtn: {
    flex: 1, padding: '11px',
    background: 'var(--bg-overlay)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-secondary)',
    fontSize: '14px', fontWeight: '600',
    fontFamily: 'var(--font-sans)', cursor: 'pointer',
    transition: 'var(--transition)',
  },
  confirmBtn: {
    flex: 1, padding: '11px',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    color: '#fff',
    fontSize: '14px', fontWeight: '700',
    fontFamily: 'var(--font-sans)', cursor: 'pointer',
    transition: 'var(--transition)',
  },
}
