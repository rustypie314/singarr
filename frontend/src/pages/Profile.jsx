import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext.jsx'
import GenrePickerModal from '../components/GenrePickerModal.jsx'

export default function Profile() {
  const { user, api } = useAuth()
  const [showGenrePicker, setShowGenrePicker] = useState(false)
  const [stats, setStats] = useState(null)

  useEffect(() => {
    api.get('/requests').then(r => {
      const reqs = r.data.requests || []
      setStats({
        total: reqs.length,
        downloaded: reqs.filter(r => r.status === 'downloaded').length,
        pending: reqs.filter(r => ['pending', 'approved', 'found', 'downloading'].includes(r.status)).length,
      })
    }).catch(() => {})
  }, [])

  const genres = user?.genres || []

  return (
    <div style={styles.root}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={styles.card}>
        {/* Avatar + info */}
        <div style={styles.profileRow}>
          <div style={styles.avatarWrap}>
            {user?.avatar
              ? <img src={user.avatar} alt="" style={styles.avatar} />
              : <div style={styles.avatarFallback}>{user?.username?.[0]?.toUpperCase()}</div>
            }
          </div>
          <div>
            <h1 style={styles.username}>{user?.username}</h1>
            <div style={styles.meta}>
              {user?.email && <span>{user.email}</span>}
              {user?.isAdmin && <span style={styles.adminBadge}>Admin</span>}
            </div>
            <div style={styles.joined}>
              Member since {new Date(user?.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div style={styles.statsRow}>
            {[
              { label: 'Total Requests', value: stats.total },
              { label: 'Downloaded', value: stats.downloaded },
              { label: 'In Progress', value: stats.pending },
            ].map(s => (
              <div key={s.label} style={styles.stat}>
                <div style={styles.statValue}>{s.value}</div>
                <div style={styles.statLabel}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Genre preferences */}
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }} style={styles.card}
      >
        <div style={styles.cardHeader}>
          <div>
            <h2 style={styles.cardTitle}>Genre Preferences</h2>
            <p style={styles.cardDesc}>Used to personalise your discovery feed.</p>
          </div>
          <button onClick={() => setShowGenrePicker(true)} style={styles.editBtn}>
            Edit genres
          </button>
        </div>

        {genres.length === 0 ? (
          <div style={styles.noGenres}>
            <span style={{ fontSize: '24px' }}>🎵</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No genres set yet</span>
            <button onClick={() => setShowGenrePicker(true)} style={styles.setGenresBtn}>
              Set your genres
            </button>
          </div>
        ) : (
          <div style={styles.genreList}>
            {genres.map(g => (
              <span key={g} style={styles.genreTag}>{g}</span>
            ))}
          </div>
        )}
      </motion.div>

      {showGenrePicker && (
        <GenrePickerModal onClose={() => setShowGenrePicker(false)} />
      )}
    </div>
  )
}

const styles = {
  root: { padding: '32px', maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' },
  card: {
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '28px',
  },
  profileRow: { display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '24px' },
  avatarWrap: { flexShrink: 0 },
  avatar: { width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover' },
  avatarFallback: {
    width: '72px', height: '72px', borderRadius: '50%',
    background: 'var(--accent)', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '28px', fontWeight: '800',
  },
  username: { fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.3px' },
  meta: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' },
  adminBadge: {
    padding: '2px 8px', background: 'var(--accent-muted)',
    color: 'var(--accent)', borderRadius: '999px',
    fontSize: '11px', fontWeight: '700',
  },
  joined: { fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' },
  statsRow: {
    display: 'flex', gap: '0',
    borderTop: '1px solid var(--border)', paddingTop: '20px',
  },
  stat: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: '4px',
    borderRight: '1px solid var(--border)',
  },
  statValue: { fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' },
  statLabel: { fontSize: '11px', color: 'var(--text-muted)' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' },
  cardTitle: { fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' },
  cardDesc: { fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' },
  editBtn: {
    padding: '7px 14px',
    background: 'var(--bg-overlay)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)',
    fontSize: '12px', fontWeight: '600',
    fontFamily: 'var(--font-sans)', cursor: 'pointer',
  },
  noGenres: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '12px', background: 'var(--bg-overlay)',
    borderRadius: 'var(--radius-md)',
  },
  setGenresBtn: {
    padding: '6px 14px',
    background: 'var(--accent)', border: 'none',
    borderRadius: 'var(--radius-sm)', color: '#fff',
    fontSize: '12px', fontWeight: '700',
    fontFamily: 'var(--font-sans)', cursor: 'pointer',
  },
  genreList: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  genreTag: {
    padding: '6px 14px',
    background: 'var(--accent-muted)', color: 'var(--accent)',
    borderRadius: '999px', fontSize: '13px', fontWeight: '600',
    border: '1px solid var(--accent)',
  },
}
