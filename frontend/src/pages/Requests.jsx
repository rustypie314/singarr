import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { TypeIcon, IconRefresh, IconTrash } from '../components/Icons.jsx'
import toast from 'react-hot-toast'

export default function Requests() {
  const { api, user } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => { fetchRequests() }, [])

  async function fetchRequests() {
    try {
      const res = await api.get('/requests/all')
      setRequests(res.data.requests || [])
    } catch { toast.error('Failed to load requests') }
    finally { setLoading(false) }
  }

  async function deleteRequest(id) {
    if (!confirm('Remove this request?')) return
    try {
      await api.delete(`/requests/${id}`)
      setRequests(r => r.filter(x => x.id !== id))
      toast.success('Request removed')
    } catch { toast.error('Failed to remove') }
  }

  const STATUSES = ['all', 'pending', 'approved', 'found', 'downloading', 'downloaded', 'rejected']
  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)



  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>Requests</h1>
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
            >
              {/* Art / Type icon */}
              <div style={styles.rowArt}>
                {req.cover_url
                  ? <img src={req.cover_url} alt="" style={styles.rowImg} />
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
                    {new Date(req.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Status */}
              <div style={styles.rowStatus}>
                <StatusBadge status={req.status} />
              </div>

              {/* Actions */}
              <button
                onClick={() => deleteRequest(req.id)}
                style={styles.deleteBtn}
                title="Remove"
              >
                <IconTrash size={15} color="currentColor" />
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
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
