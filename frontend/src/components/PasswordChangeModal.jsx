import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext.jsx'
import { IconCheck } from './Icons.jsx'
import toast from 'react-hot-toast'

function PasswordStrength({ password }) {
  if (!password) return null
  const score = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length
  const colors = ['', '#ef4444', '#e8a30f', '#4f9cf9', '#2dbe6c']
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= score ? colors[score] : 'var(--border-strong)', transition: 'background 200ms' }} />
        ))}
      </div>
      <div style={{ fontSize: 12, color: colors[score] }}>{labels[score]}</div>
    </div>
  )
}

export default function PasswordChangeModal({ onClose }) {
  const { api } = useAuth()
  const [current, setCurrent]   = useState('')
  const [next, setNext]         = useState('')
  const [confirm, setConfirm]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [success, setSuccess]   = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!current) return setError('Enter your current password')
    if (next.length < 8) return setError('New password must be at least 8 characters')
    if (next !== confirm) return setError('Passwords do not match')

    setSaving(true)
    try {
      await api.post('/auth/local/change-password', {
        currentPassword: current,
        newPassword: next,
      })
      setSuccess(true)
      toast.success('Password updated!')
      setTimeout(onClose, 1500)
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to update password')
    } finally { setSaving(false) }
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        style={s.modal}
        onClick={e => e.stopPropagation()}
      >
        <div style={s.header}>
          <div style={s.headerIcon}>🔑</div>
          <div>
            <h2 style={s.title}>Change password</h2>
            <p style={s.subtitle}>Update your local admin password</p>
          </div>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>

        {success ? (
          <div style={s.successBox}>
            <IconCheck size={24} color="#2dbe6c" />
            <span style={{ fontSize: 15, color: '#2dbe6c', fontWeight: 600 }}>Password updated!</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={s.field}>
              <label style={s.label}>Current password</label>
              <input
                type="password" value={current}
                onChange={e => { setCurrent(e.target.value); setError('') }}
                placeholder="Your current password"
                style={s.input} autoFocus autoComplete="current-password"
              />
            </div>

            <div style={s.field}>
              <label style={s.label}>New password</label>
              <input
                type="password" value={next}
                onChange={e => { setNext(e.target.value); setError('') }}
                placeholder="At least 8 characters"
                style={s.input} autoComplete="new-password"
              />
              <PasswordStrength password={next} />
            </div>

            <div style={s.field}>
              <label style={s.label}>Confirm new password</label>
              <input
                type="password" value={confirm}
                onChange={e => { setConfirm(e.target.value); setError('') }}
                placeholder="Re-enter new password"
                style={{
                  ...s.input,
                  borderColor: confirm && next && confirm !== next ? 'rgba(239,68,68,0.5)' : undefined,
                }}
                autoComplete="new-password"
              />
            </div>

            {error && (
              <div style={s.errorBox}>✕ {error}</div>
            )}

            <div style={s.actions}>
              <button type="button" onClick={onClose} style={s.cancelBtn}>Cancel</button>
              <motion.button
                type="submit"
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                disabled={saving}
                style={{ ...s.submitBtn, opacity: saving ? 0.75 : 1 }}
              >
                {saving
                  ? <><span style={s.spinner} />Updating…</>
                  : 'Update password'
                }
              </motion.button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  )
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 100,
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
  },
  modal: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-xl)',
    padding: '28px 28px 24px',
    width: '100%', maxWidth: 420,
    boxShadow: '0 32px 64px rgba(0,0,0,0.4)',
  },
  header: { display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 24 },
  headerIcon: { fontSize: 28, flexShrink: 0, lineHeight: 1 },
  title:    { fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.3px' },
  subtitle: { fontSize: 13, color: 'var(--text-muted)', marginTop: 2 },
  closeBtn: { marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: 4, flexShrink: 0 },
  field:  { marginBottom: 16 },
  label:  { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 7 },
  input:  {
    width: '100%', padding: '11px 14px',
    background: 'var(--bg-overlay)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontSize: 15, fontFamily: 'var(--font-sans)',
    outline: 'none', transition: 'border-color var(--transition)',
  },
  errorBox: {
    padding: '10px 14px', marginBottom: 16,
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: 9, color: '#ef4444', fontSize: 13,
  },
  successBox: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 12, padding: '28px 0',
  },
  actions:    { display: 'flex', gap: 10, marginTop: 6 },
  cancelBtn: {
    flex: 1, padding: '11px',
    background: 'var(--bg-overlay)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-secondary)',
    fontSize: 14, fontWeight: 600,
    fontFamily: 'var(--font-sans)', cursor: 'pointer',
  },
  submitBtn: {
    flex: 1, padding: '11px',
    background: 'var(--accent)', border: 'none',
    borderRadius: 'var(--radius-md)',
    color: '#fff', fontSize: 14, fontWeight: 700,
    fontFamily: 'var(--font-sans)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  spinner: {
    width: 15, height: 15,
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
    display: 'inline-block',
  },
}
