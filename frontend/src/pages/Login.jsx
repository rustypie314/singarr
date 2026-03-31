import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useTheme } from '../contexts/ThemeContext.jsx'
import axios from 'axios'
import toast from 'react-hot-toast'

const PLEX_AUTH_URL = 'https://app.plex.tv/auth#'

export default function Login() {
  const { login } = useAuth()
  const { theme, toggle } = useTheme()
  const [mode, setMode] = useState('main') // 'main' | 'admin-login'
  const [plexLoading, setPlexLoading] = useState(false)
  const pollRef = useRef(null)

  // Local admin login
  const [localUsername, setLocalUsername] = useState('')
  const [localPassword, setLocalPassword] = useState('')
  const [localLoading, setLocalLoading] = useState(false)
  const [localError, setLocalError] = useState('')

  useEffect(() => () => clearInterval(pollRef.current), [])

  async function handlePlexLogin() {
    setPlexLoading(true)
    try {
      const pinRes = await axios.post('/api/auth/plex/pin')
      const { id: pinId, code } = pinRes.data
      const authUrl = `${PLEX_AUTH_URL}?clientID=singarr&code=${code}&context[device][product]=Singarr`
      const popup = window.open(authUrl, 'plex-auth', 'width=800,height=700,menubar=no,toolbar=no')

      pollRef.current = setInterval(async () => {
        try {
          const res = await axios.get(`/api/auth/plex/pin/${pinId}`)
          if (res.data.authenticated) {
            clearInterval(pollRef.current)
            popup?.close()
            if (!res.data.approved) {
              login(res.data.token, res.data.user)
              toast('Your account is pending admin approval.', { icon: '⏳' })
              return
            }
            login(res.data.token, res.data.user)
            toast.success(`Welcome, ${res.data.user.username}!`)
          }
        } catch {}
      }, 2000)

      setTimeout(() => { clearInterval(pollRef.current); setPlexLoading(false) }, 300000)
    } catch {
      toast.error('Failed to connect to Plex. Check your server config.')
      setPlexLoading(false)
    }
  }

  async function handleLocalLogin(e) {
    e.preventDefault()
    setLocalError('')
    if (!localUsername || !localPassword) return setLocalError('Enter your username and password')
    setLocalLoading(true)
    try {
      const res = await axios.post('/api/auth/local', { username: localUsername, password: localPassword })
      login(res.data.token, res.data.user)
      toast.success(`Welcome back, ${res.data.user.username}!`)
    } catch (e) {
      setLocalError(e.response?.data?.error || 'Login failed')
    } finally {
      setLocalLoading(false)
    }
  }

  return (
    <div style={styles.root}>
      <div style={styles.orb1} />
      <div style={styles.orb2} />

      <button onClick={toggle} style={styles.themeBtn} aria-label="Toggle theme">
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>

      <AnimatePresence mode="wait">

        {/* ── Main screen ── */}
        {mode === 'main' && (
          <motion.div key="main"
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.3, ease: [0.4,0,0.2,1] }}
            style={styles.card}
          >
            <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }} style={styles.logoWrap}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                <path d="M9 18V6l12-2v12" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="6" cy="18" r="3" stroke="#fff" stroke-width="2.2"/>
                <circle cx="18" cy="16" r="3" stroke="#fff" stroke-width="2.2"/>
              </svg>
            </motion.div>

            <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} style={styles.title}>
              Singarr
            </motion.h1>

            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} style={styles.subtitle}>
              Request music for your Plex library
            </motion.p>

            {/* Plex login */}
            <motion.button
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={handlePlexLogin} disabled={plexLoading}
              style={{ ...styles.plexBtn, opacity: plexLoading ? 0.75 : 1 }}
            >
              {plexLoading ? (
                <span style={styles.spinner} />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 19.2L5.4 12 12 4.8 18.6 12 12 19.2z"/>
                </svg>
              )}
              {plexLoading ? 'Waiting for Plex…' : 'Sign in with Plex'}
            </motion.button>

            {/* Divider */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} style={styles.divider}>
              <div style={styles.dividerLine} />
              <span style={styles.dividerText}>or</span>
              <div style={styles.dividerLine} />
            </motion.div>

            {/* Admin login link */}
            <motion.button
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
              whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
              onClick={() => setMode('admin-login')}
              style={styles.adminBtn}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" stroke-width="1.8"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
              Admin login
            </motion.button>

            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} style={styles.hint}>
              Plex users sign in above. Admins have a separate local account.
            </motion.p>
          </motion.div>
        )}

        {/* ── Admin login form ── */}
        {mode === 'admin-login' && (
          <motion.div key="admin"
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.3, ease: [0.4,0,0.2,1] }}
            style={styles.card}
          >
            <div style={styles.logoWrap}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="#fff" stroke-width="2" fill="none"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none"/>
              </svg>
            </div>

            <h1 style={styles.title}>Admin login</h1>
            <p style={styles.subtitle}>Sign in with your local admin account</p>

            <form onSubmit={handleLocalLogin} style={{ width: '100%' }}>
              <div style={styles.fieldWrap}>
                <label style={styles.fieldLabel}>Username</label>
                <input
                  style={styles.fieldInput}
                  type="text" value={localUsername}
                  onChange={e => { setLocalUsername(e.target.value); setLocalError('') }}
                  placeholder="admin" autoFocus autoComplete="username"
                />
              </div>
              <div style={styles.fieldWrap}>
                <label style={styles.fieldLabel}>Password</label>
                <input
                  style={styles.fieldInput}
                  type="password" value={localPassword}
                  onChange={e => { setLocalPassword(e.target.value); setLocalError('') }}
                  placeholder="••••••••" autoComplete="current-password"
                />
              </div>

              {localError && (
                <div style={styles.errorPill}>✕ {localError}</div>
              )}

              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                type="submit" disabled={localLoading}
                style={{ ...styles.loginBtn, opacity: localLoading ? 0.75 : 1, marginTop: 4 }}
              >
                {localLoading ? <span style={styles.spinner} /> : null}
                {localLoading ? 'Signing in…' : 'Sign in'}
              </motion.button>
            </form>

            <button onClick={() => { setMode('main'); setLocalError(''); setLocalUsername(''); setLocalPassword('') }}
              style={styles.backLink}>
              ← Back to login
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const styles = {
  root: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-base)', position: 'relative', overflow: 'hidden',
  },
  orb1: { position: 'absolute', top: '-10%', left: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(26,122,69,0.12) 0%, transparent 70%)', filter: 'blur(40px)', pointerEvents: 'none' },
  orb2: { position: 'absolute', bottom: '-15%', right: '-5%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(45,190,108,0.07) 0%, transparent 70%)', filter: 'blur(60px)', pointerEvents: 'none' },
  themeBtn: { position: 'absolute', top: 24, right: 24, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '50%', width: 40, height: 40, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'var(--transition)', zIndex: 10 },
  card: {
    background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)',
    padding: '44px 40px', width: '100%', maxWidth: 400,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
    boxShadow: '0 32px 64px rgba(0,0,0,0.3)', position: 'relative', zIndex: 1,
  },
  logoWrap: { width: 70, height: 70, background: 'linear-gradient(135deg, #1a7a45, #2dbe6c)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 30px rgba(26,122,69,0.38)', marginBottom: 2 },
  title: { fontSize: 27, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text-primary)' },
  subtitle: { fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 6 },
  plexBtn: { width: '100%', padding: '14px 24px', background: '#e5a00d', color: '#000', fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-sans)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'var(--transition)' },
  divider: { width: '100%', display: 'flex', alignItems: 'center', gap: 12 },
  dividerLine: { flex: 1, height: 1, background: 'var(--border)' },
  dividerText: { fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 },
  adminBtn: { width: '100%', padding: '12px 20px', background: 'var(--bg-overlay)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-sans)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'var(--transition)' },
  hint: { fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 },
  fieldWrap: { width: '100%', marginBottom: 12 },
  fieldLabel: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 },
  fieldInput: { width: '100%', padding: '11px 14px', background: 'var(--bg-overlay)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'var(--font-sans)', outline: 'none' },
  errorPill: { width: '100%', padding: '9px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 9, color: '#ef4444', fontSize: 13, marginBottom: 8 },
  loginBtn: { width: '100%', padding: '13px', background: '#1a7a45', border: 'none', borderRadius: 'var(--radius-md)', color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-sans)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  backLink: { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)', marginTop: 4 },
  spinner: { width: 16, height: 16, border: '2px solid rgba(255,255,255,0.25)', borderTopColor: 'currentColor', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' },
}
