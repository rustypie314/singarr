import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { TypeIcon, IconRefresh, IconTrash } from '../components/Icons.jsx'
import toast from 'react-hot-toast'
import { formatDateShort, proxyCover } from '../utils/date.js'

export default function Requests() {
  const { api, user } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [plexConfig, setPlexConfig] = useState(null)

  useEffect(() => { fetchRequests() }, [])

  async function fetchRequests() {
    try {
      const res = await api.get('/requests/all')
      setRequests(res.data.requests || [])
      setPlexConfig(res.data.plexConfig || null)
    } catch { toast.error('Failed to load requests') }
    finally { setLoading(false) }
  }

  const [confirmDelete, setConfirmDelete] = useState(null)
  const [rejectModal, setRejectModal]     = useState(null)
  const [rejectNote, setRejectNote]       = useState('')
  const [reasonModal, setReasonModal]     = useState(null) // holds rejected request to show reason

  async function deleteRequest(id) {
    try {
      await api.delete(`/requests/${id}`)
      setRequests(r => r.filter(x => x.id !== id))
      toast.success('Request removed')
    } catch { toast.error('Failed to remove') }
  }

  async function updateStatus(id, status, note = '') {
    try {
      await api.put(`/requests/${id}/status`, { status, note })
      setRequests(r => r.map(x => x.id === id ? { ...x, status, notes: note || null } : x))
      toast.success(status === 'approved' ? 'Request approved' : 'Request rejected')
    } catch { toast.error('Failed to update request') }
  }

  const STATUSES = ['all', 'pending', 'approved', 'found', 'downloading', 'downloaded', 'rejected']
  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)



  return (
    <>
    <div style={styles.root}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.pageTitle} className="page-title-mobile">Requests</h1>
          <p style={styles.pageSubtitle}>
            {user?.isAdmin ? 'All user requests' : 'Your music requests'}
          </p>
        </div>
        <button onClick={fetchRequests} style={styles.refreshBtn}>
          <IconRefresh size={14} color="currentColor" /> Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div style={styles.filterRow}>
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              ...styles.filterBtn,
              background: filter === s ? 'var(--accent-muted)' : 'transparent',
              color: filter === s ? 'var(--accent)' : 'var(--text-secondary)',
              borderColor: filter === s ? 'var(--accent)' : 'var(--border)',
            }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
            <span style={styles.filterCount}>
              {s === 'all' ? requests.length : requests.filter(r => r.status === s).length}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div style={styles.loadingWrap}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '80px', borderRadius: 'var(--radius-md)', marginBottom: '8px' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={styles.empty}>
          <div style={{ fontSize: '40px', opacity: 0.3 }}>♪</div>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>No requests found</p>
        </div>
      ) : (
        <div style={styles.list}>
          {filtered.map((req, i) => (
            <motion.div
              key={req.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              style={styles.row}
              className="req-row-stack"
            >
              {/* Art / Type icon */}
              <div style={styles.rowArt}>
                {proxyCover(req.cover_url)
                  ? <img src={proxyCover(req.cover_url)} alt="" style={styles.rowImg} />
                  : <div style={styles.rowIconWrap}>
                      <TypeIcon type={req.type} size={22} color="var(--accent)" />
                    </div>
                }
              </div>

              {/* Info */}
              <div style={styles.rowInfo}>
                <div style={styles.rowTitle}>{req.title}</div>
                {req.artist_name && req.type !== 'artist' && (
                  <div style={styles.rowSub}>{req.artist_name}</div>
                )}
                <div style={styles.rowMeta}>
                  <span style={styles.typeTag}>
                    <TypeIcon type={req.type} size={11} color="var(--accent)" />
                    {req.type}
                  </span>
                  {user?.isAdmin && req.username && (
                    <span style={styles.userTag}>by {req.username}</span>
                  )}
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                    {formatDateShort(req.created_at)}
                  </span>
                </div>
              </div>

              {/* Status */}
              <div style={styles.rowStatus} className="req-status-col">
                {req.status === 'rejected' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <StatusBadge status={req.status} />
                    <button onClick={() => setReasonModal(req)}
                      title="View rejection reason"
                      style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 11, fontStyle: 'italic', fontFamily: 'Georgia, serif', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, padding: 0 }}>
                      i
                    </button>
                  </div>
                ) : req.status === 'downloaded' && req.quality ? (() => {
                  const qualityLabel = req.quality === '24bit-flac' ? '24-bit FLAC'
                                     : req.quality === '16bit-flac' ? '16-bit FLAC'
                                     : req.quality === 'flac'       ? 'FLAC' : null
                  const bg    = req.quality === '24bit-flac' ? 'rgba(24,95,165,0.85)' : 'rgba(15,110,86,0.85)'
                  const color = req.quality === '24bit-flac' ? '#B5D4F4' : '#9FE1CB'
                  return qualityLabel
                    ? <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: bg, color, display: 'inline-block' }}>
                        ✓ Downloaded · {qualityLabel}
                      </span>
                    : <StatusBadge status={req.status} />
                })()
                : <StatusBadge status={req.status} />}
                {req.plex_rating_key && plexConfig?.machineId && (() => {
                  const effectiveMode = user?.isAdmin ? (plexConfig?.openMode || 'web') : 'web'
                  const detailPath = `#!/server/${plexConfig.machineId}/details?key=%2Flibrary%2Fmetadata%2F${req.plex_rating_key}`
                  const webLink = `https://app.plex.tv/desktop/${detailPath}`
                  const localUrl = plexConfig?.localUrl?.replace(/\/$/, '')
                  const localLink = localUrl ? `${localUrl}/web/index.html${detailPath}` : null
                  const bW = { fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(229,160,13,0.12)', color: '#e5a00d', border: '1px solid rgba(229,160,13,0.3)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }
                  const bL = { fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(79,156,249,0.12)', color: '#4f9cf9', border: '1px solid rgba(79,156,249,0.3)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }
                  if (effectiveMode === 'both') return (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6, justifyContent: 'flex-end' }}>
                      <a href={webLink} target="_blank" rel="noreferrer" style={bW}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#e5a00d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                        Open in Plex
                      </a>
                      {localLink && <a href={localLink} target="_blank" rel="noreferrer" style={bL}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4f9cf9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                        Open in Plex
                      </a>}
                    </div>
                  )
                  const href = effectiveMode === 'local' && localLink ? localLink : webLink
                  return (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, justifyContent: 'flex-end' }}>
                      <a href={href} target="_blank" rel="noreferrer" style={bW}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#e5a00d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                        Open in Plex
                      </a>
                    </div>
                  )
                })()}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }} className="req-actions-col">
                {user?.isAdmin && req.status === 'pending' && (
                  <>
                    <button onClick={() => updateStatus(req.id, 'approved')}
                      style={{ padding: '5px 12px', background: 'rgba(45,190,108,0.12)', border: '1px solid rgba(45,190,108,0.3)', borderRadius: 7, color: '#2dbe6c', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-sans)', cursor: 'pointer' }}>
                      ✓ Approve
                    </button>
                    <button onClick={() => { setRejectModal(req); setRejectNote('') }}
                      style={{ padding: '5px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 7, color: '#ef4444', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-sans)', cursor: 'pointer' }}>
                      ✕ Reject
                    </button>
                  </>
                )}
                <button
                  onClick={() => setConfirmDelete(req)}
                  style={styles.deleteBtn}
                  title="Remove"
                >
                  <IconTrash size={15} color="currentColor" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>

      {/* Reject reason modal */}
      {rejectModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setRejectModal(null)}>
          <div className="modal-mobile" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: 28, maxWidth: 400, width: '100%', boxShadow: '0 32px 64px rgba(0,0,0,0.4)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>✕</div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Reject request?</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2 }}>Rejecting:</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
              {rejectModal.title}{rejectModal.artist_name ? ` — ${rejectModal.artist_name}` : ''}
            </p>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Reason</div>
            <textarea
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              placeholder="e.g. Already available in a different format..."
              maxLength={500}
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', background: 'var(--bg-overlay)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-sans)', resize: 'vertical', minHeight: 80, outline: 'none', marginBottom: 6 }}
            />
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 20 }}>Optional — included in the notification email to the user.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setRejectModal(null)}
                style={{ flex: 1, padding: 11, background: 'var(--bg-overlay)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-sans)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => { updateStatus(rejectModal.id, 'rejected', rejectNote); setRejectModal(null); setRejectNote('') }}
                style={{ flex: 1, padding: 11, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 'var(--radius-md)', color: '#ef4444', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-sans)', cursor: 'pointer' }}>
                ✕ Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection reason modal */}
      {reasonModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setReasonModal(null)}>
          <div className="modal-mobile" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: 28, maxWidth: 400, width: '100%', boxShadow: '0 32px 64px rgba(0,0,0,0.4)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>✕</div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Request rejected</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              {reasonModal.title}{reasonModal.artist_name ? ` — ${reasonModal.artist_name}` : ''}
            </p>
            {reasonModal.notes
              ? <div style={{ background: 'var(--bg-overlay)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
                  {reasonModal.notes}
                </div>
              : <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 20 }}>No reason was provided.</p>
            }
            <button onClick={() => setReasonModal(null)}
              style={{ width: '100%', padding: 11, background: 'var(--bg-overlay)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-sans)', cursor: 'pointer' }}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setConfirmDelete(null)}>
          <div className="modal-mobile" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: 28, maxWidth: 400, width: '100%', boxShadow: '0 32px 64px rgba(0,0,0,0.4)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>🗑️</div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Remove request?</h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>
              <strong style={{ color: 'var(--text-primary)' }}>{confirmDelete.title}</strong>
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
              This will remove the request from Singarr. It will not affect anything in Lidarr or Plex.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)}
                style={{ flex: 1, padding: 11, background: 'var(--bg-overlay)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-sans)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => { deleteRequest(confirmDelete.id); setConfirmDelete(null) }}
                style={{ flex: 1, padding: 11, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 'var(--radius-md)', color: '#ef4444', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-sans)', cursor: 'pointer' }}>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const styles = {
  root: { padding: '24px', maxWidth: '900px', margin: '0 auto' },
  header: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: '24px',
  },
  pageTitle: { fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' },
  pageSubtitle: { fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' },
  refreshBtn: {
    padding: '8px 16px',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '500',
    fontFamily: 'var(--font-sans)', cursor: 'pointer',
    transition: 'var(--transition)',
    display: 'flex', alignItems: 'center', gap: '6px',
  },
  filterRow: {
    display: 'flex', gap: '6px', flexWrap: 'wrap',
    marginBottom: '20px',
  },
  filterBtn: {
    padding: '6px 12px',
    border: '1px solid', borderRadius: '999px',
    fontSize: '12px', fontWeight: '600',
    fontFamily: 'var(--font-sans)', cursor: 'pointer',
    transition: 'var(--transition)',
    display: 'flex', alignItems: 'center', gap: '6px',
  },
  filterCount: {
    background: 'var(--bg-overlay)',
    padding: '1px 6px', borderRadius: '999px',
    fontSize: '10px', fontFamily: 'var(--font-mono)',
  },
  loadingWrap: {},
  empty: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: '60px', gap: '12px',
  },
  list: { display: 'flex', flexDirection: 'column', gap: '8px' },
  row: {
    display: 'flex', alignItems: 'center', gap: '14px',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '12px 16px',
    transition: 'border-color var(--transition)',
  },
  rowArt: { flexShrink: 0 },
  rowImg: {
    width: '48px', height: '48px',
    borderRadius: 'var(--radius-sm)',
    objectFit: 'cover',
  },
  rowIconWrap: {
    width: '48px', height: '48px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-overlay)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '20px', color: 'var(--text-muted)',
  },
  rowInfo: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontSize: '14px', fontWeight: '600',
    color: 'var(--text-primary)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  rowSub: {
    fontSize: '12px', color: 'var(--text-secondary)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  rowMeta: {
    display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px',
  },
  typeTag: {
    fontSize: '11px', fontWeight: '700',
    color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em',
    display: 'inline-flex', alignItems: 'center', gap: '3px',
  },
  userTag: { fontSize: '11px', color: 'var(--text-muted)' },
  rowStatus: { flexShrink: 0 },
  deleteBtn: {
    background: 'none', border: 'none',
    color: 'var(--text-muted)', cursor: 'pointer',
    fontSize: '14px', padding: '6px',
    borderRadius: 'var(--radius-sm)',
    transition: 'var(--transition)', flexShrink: 0,
  },
}
