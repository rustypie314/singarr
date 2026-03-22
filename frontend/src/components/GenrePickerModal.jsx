import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext.jsx'
import toast from 'react-hot-toast'

const GENRES = [
  'Alternative', 'Ambient', 'Blues', 'Classical', 'Country',
  'Dance', 'Electronic', 'Folk', 'Funk', 'Hip-Hop',
  'Indie', 'Jazz', 'Latin', 'Metal', 'Pop',
  'Punk', 'R&B', 'Reggae', 'Rock', 'Soul',
  'Soundtrack', 'World', 'K-Pop', 'Afrobeats', 'Gospel',
]

const GENRE_COLORS = {
  'Alternative': '#7c6fcd', 'Ambient': '#5b9bd5', 'Blues': '#2563eb',
  'Classical': '#854d0e', 'Country': '#b45309', 'Dance': '#e879f9',
  'Electronic': '#06b6d4', 'Folk': '#65a30d', 'Funk': '#f59e0b',
  'Hip-Hop': '#f97316', 'Indie': '#8b5cf6', 'Jazz': '#b45309',
  'Latin': '#ef4444', 'Metal': '#6b7280', 'Pop': '#ec4899',
  'Punk': '#dc2626', 'R&B': '#7c3aed', 'Reggae': '#16a34a',
  'Rock': '#e8490f', 'Soul': '#9333ea', 'Soundtrack': '#0891b2',
  'World': '#059669', 'K-Pop': '#db2777', 'Afrobeats': '#d97706',
  'Gospel': '#7c3aed',
}

export default function GenrePickerModal({ onClose, isFirstTime = false }) {
  const { api, refreshUser, user } = useAuth()
  const [selected, setSelected] = useState(new Set(user?.genres || []))
  const [saving, setSaving] = useState(false)

  function toggle(genre) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(genre) ? next.delete(genre) : next.add(genre)
      return next
    })
  }

  async function save() {
    setSaving(true)
    try {
      await api.put('/profile/genres', { genres: [...selected] })
      await refreshUser()
      toast.success('Genre preferences saved!')
      onClose()
    } catch {
      toast.error('Failed to save genres')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={styles.overlay}
        onClick={isFirstTime ? undefined : onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 32, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 280, damping: 26 }}
          style={styles.modal}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={styles.header}>
            <div style={styles.headerIcon}>🎵</div>
            <div>
              <h2 style={styles.title}>
                {isFirstTime ? 'What music do you love?' : 'Your Genre Preferences'}
              </h2>
              <p style={styles.subtitle}>
                {isFirstTime
                  ? 'Pick your favourite genres to personalise your discovery feed.'
                  : 'Update your genres to refresh your recommendations.'}
              </p>
            </div>
            {!isFirstTime && (
              <button onClick={onClose} style={styles.closeBtn}>✕</button>
            )}
          </div>

          {/* Genre grid */}
          <div style={styles.grid}>
            {GENRES.map((genre, i) => {
              const active = selected.has(genre)
              const color = GENRE_COLORS[genre] || 'var(--accent)'
              return (
                <motion.button
                  key={genre}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => toggle(genre)}
                  style={{
                    ...styles.genreBtn,
                    background: active ? color : 'var(--bg-overlay)',
                    color: active ? '#fff' : 'var(--text-secondary)',
                    border: `1px solid ${active ? color : 'var(--border)'}`,
                    boxShadow: active ? `0 4px 16px ${color}44` : 'none',
                  }}
                >
                  {genre}
                  {active && <span style={styles.checkmark}>✓</span>}
                </motion.button>
              )
            })}
          </div>

          {/* Footer */}
          <div style={styles.footer}>
            <span style={styles.selectedCount}>
              {selected.size} genre{selected.size !== 1 ? 's' : ''} selected
            </span>
            <div style={styles.footerActions}>
              {!isFirstTime && (
                <button onClick={onClose} style={styles.cancelBtn}>Cancel</button>
              )}
              {isFirstTime && selected.size === 0 && (
                <button onClick={onClose} style={styles.skipBtn}>Skip for now</button>
              )}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={save}
                disabled={saving}
                style={{ ...styles.saveBtn, opacity: saving ? 0.7 : 1 }}
              >
                {saving ? 'Saving…' : isFirstTime ? 'Let\'s go →' : 'Save preferences'}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.75)',
    backdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: '20px',
  },
  modal: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-xl)',
    width: '100%', maxWidth: '560px',
    maxHeight: '90vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'flex-start', gap: '14px',
    padding: '28px 28px 20px',
    borderBottom: '1px solid var(--border)',
  },
  headerIcon: { fontSize: '32px', flexShrink: 0 },
  title: {
    fontSize: '20px', fontWeight: '800',
    color: 'var(--text-primary)', letterSpacing: '-0.3px',
  },
  subtitle: { fontSize: '13px', color: 'var(--text-secondary)', marginTop: '3px' },
  closeBtn: {
    marginLeft: 'auto', background: 'none', border: 'none',
    color: 'var(--text-muted)', cursor: 'pointer',
    fontSize: '16px', padding: '4px', flexShrink: 0,
  },
  grid: {
    display: 'flex', flexWrap: 'wrap', gap: '8px',
    padding: '20px 28px',
    overflowY: 'auto', flex: 1,
  },
  genreBtn: {
    padding: '8px 16px',
    borderRadius: '999px',
    fontSize: '13px', fontWeight: '600',
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer', transition: 'all 150ms ease',
    display: 'flex', alignItems: 'center', gap: '6px',
    whiteSpace: 'nowrap',
  },
  checkmark: { fontSize: '11px' },
  footer: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 28px',
    borderTop: '1px solid var(--border)',
    gap: '12px',
  },
  selectedCount: { fontSize: '13px', color: 'var(--text-muted)', flexShrink: 0 },
  footerActions: { display: 'flex', gap: '10px' },
  cancelBtn: {
    padding: '9px 18px',
    background: 'var(--bg-overlay)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)',
    fontSize: '13px', fontWeight: '600',
    fontFamily: 'var(--font-sans)', cursor: 'pointer',
  },
  skipBtn: {
    padding: '9px 18px',
    background: 'none', border: 'none',
    color: 'var(--text-muted)',
    fontSize: '13px', fontWeight: '500',
    fontFamily: 'var(--font-sans)', cursor: 'pointer',
  },
  saveBtn: {
    padding: '9px 20px',
    background: 'var(--accent)', border: 'none',
    borderRadius: 'var(--radius-md)', color: '#fff',
    fontSize: '13px', fontWeight: '700',
    fontFamily: 'var(--font-sans)', cursor: 'pointer',
    transition: 'var(--transition)',
  },
}
