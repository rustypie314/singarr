import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import axios from 'axios'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useTheme } from '../contexts/ThemeContext.jsx'
import {
  IconMusicNote, IconDisc, IconMicrophone,
  IconHeadphones, IconCheck, IconDownload, IconRefresh, IconSettings
} from '../components/Icons.jsx'

const api = axios.create({ baseURL: '/api' })

const STEPS = [
  { id: 'admin',    label: 'Admin',    Icon: IconMicrophone },
  { id: 'services', label: 'Services', Icon: IconSettings   },
  { id: 'users',    label: 'Users',    Icon: IconHeadphones },
]

function StepDot({ step, index, current }) {
  const done = index < current
  const active = index === current
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <div style={{
        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: done ? '#1a7a45' : active ? 'rgba(26,122,69,0.18)' : '#1e1e22',
        border: `2px solid ${done || active ? '#1a7a45' : 'rgba(255,255,255,0.1)'}`,
        transition: 'all 300ms ease',
      }}>
        {done ? <IconCheck size={15} color="#fff" /> : <step.Icon size={14} color={active ? '#2dbe6c' : '#55555f'} />}
      </div>
      <div style={{ marginLeft: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#55555f', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Step {index + 1}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: active ? '#f0f0f2' : done ? '#9898a8' : '#55555f' }}>{step.label}</div>
      </div>
    </div>
  )
}

function TestResult({ result }) {
  if (!result) return null
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 12px', borderRadius: 8, marginTop: 6,
      background: result.ok ? 'rgba(26,122,69,0.1)' : 'rgba(239,68,68,0.1)',
      border: `1px solid ${result.ok ? 'rgba(26,122,69,0.3)' : 'rgba(239,68,68,0.3)'}`,
      fontSize: 12, color: result.ok ? '#2dbe6c' : '#ef4444',
    }}>
      {result.ok
        ? <><IconCheck size={13} color="#2dbe6c" />{result.message || 'Connected'}</>
        : <>✕ {result.error}</>
      }
    </motion.div>
  )
}

function ApiField({ label, hint, type = 'text', value, onChange, placeholder, onTest, testing, testResult, optional = true }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <label style={s.label}>{label}</label>
        {optional && <span style={s.optTag}>OPTIONAL</span>}
      </div>
      {hint && <div style={s.hint}>{hint}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type={type} value={value}
          onChange={e => { onChange(e.target.value); }}
          placeholder={placeholder} style={s.input}
          autoComplete="off" spellCheck={false}
        />
        {onTest && (
          <button
            onClick={onTest}
            disabled={testing || !value.trim()}
            style={{ ...s.testBtn, opacity: (testing || !value.trim()) ? 0.45 : 1 }}
          >
            {testing
              ? <span style={s.spinner} />
              : <><IconRefresh size={12} color="currentColor" />Test</>
            }
          </button>
        )}
      </div>
      <TestResult result={testResult} />
    </div>
  )
}

function PasswordStrength({ password }) {
  if (!password) return null
  const score = [password.length >= 8, /[A-Z]/.test(password), /[0-9]/.test(password), /[^a-zA-Z0-9]/.test(password)].filter(Boolean).length
  const colors = ['', '#ef4444', '#e8a30f', '#4f9cf9', '#2dbe6c']
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  return (
    <div style={{ marginTop: -8, marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {[1,2,3,4].map(i => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= score ? colors[score] : 'rgba(255,255,255,0.08)', transition: 'background 200ms' }} />)}
      </div>
      <div style={{ fontSize: 11, color: colors[score] }}>{labels[score]}</div>
    </div>
  )
}

export default function SetupWizard({ onComplete }) {
  const { login } = useAuth()
  const { theme, toggle } = useTheme()
  const [step, setStep] = useState(0)
  const [adminToken, setAdminToken] = useState(null)
  const [adminUserId, setAdminUserId] = useState(null)

  // Step 1 — local admin
  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminConfirm, setAdminConfirm] = useState('')
  const [adminCreating, setAdminCreating] = useState(false)
  const [adminUser, setAdminUser] = useState(null)
  const [adminError, setAdminError] = useState('')
  const [plexLinking, setPlexLinking] = useState(false)
  const [plexLinked, setPlexLinked] = useState(false)
  const pollRef = useRef(null)

  // Step 2 — services (all optional)
  const [lidarrUrl, setLidarrUrl]   = useState('')
  const [lidarrKey, setLidarrKey]   = useState('')
  const [plexUrl, setPlexUrl]       = useState('')
  const [plexToken, setPlexToken]   = useState('')
  const [lastfmKey, setLastfmKey]   = useState('')
  const [fanartKey, setFanartKey]   = useState('')

  // Test states
  const [lidarrTest, setLidarrTest]   = useState(null)
  const [plexTest, setPlexTest]       = useState(null)
  const [lastfmTest, setLastfmTest]   = useState(null)
  const [fanartTest, setFanartTest]   = useState(null)
  const [lidarrTesting, setLidarrTesting] = useState(false)
  const [plexTesting, setPlexTesting]     = useState(false)
  const [lastfmTesting, setLastfmTesting] = useState(false)
  const [fanartTesting, setFanartTesting] = useState(false)

  // Step 3 — users
  const [plexUsers, setPlexUsers]       = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => () => clearInterval(pollRef.current), [])

  // ── Admin account ─────────────────────────────────────
  async function createLocalAdmin() {
    setAdminError('')
    if (!adminUsername.trim()) return setAdminError('Username is required')
    if (adminUsername.trim().length < 3) return setAdminError('Username must be at least 3 characters')
    if (!adminPassword) return setAdminError('Password is required')
    if (adminPassword.length < 8) return setAdminError('Password must be at least 8 characters')
    if (adminPassword !== adminConfirm) return setAdminError('Passwords do not match')
    setAdminCreating(true)
    try {
      const { data } = await api.post('/setup/local-admin', { username: adminUsername.trim(), password: adminPassword })
      setAdminUser(data.user)
      setAdminToken(data.token)
      setAdminUserId(data.user.id)
      toast.success('Admin account created!')
    } catch (e) {
      setAdminError(e.response?.data?.error || 'Failed to create account')
    } finally { setAdminCreating(false) }
  }

  async function linkPlex() {
    setPlexLinking(true)
    try {
      const { data } = await api.post('/setup/plex/pin')
      const popup = window.open(`https://app.plex.tv/auth#?clientID=singarr&code=${data.code}&context[device][product]=Singarr`, 'plex-auth', 'width=800,height=700')
      pollRef.current = setInterval(async () => {
        try {
          const res = await api.get(`/setup/plex/pin/${data.id}?linkToUserId=${adminUserId}`)
          if (res.data.authenticated) {
            clearInterval(pollRef.current)
            popup?.close()
            setPlexLinked(true)
            setPlexLinking(false)
            toast.success('Plex account linked!')
          }
        } catch {}
      }, 2000)
      setTimeout(() => { clearInterval(pollRef.current); setPlexLinking(false) }, 300000)
    } catch { toast.error('Could not connect to Plex'); setPlexLinking(false) }
  }

  // ── Test connections ──────────────────────────────────
  async function testLidarr() {
    setLidarrTesting(true); setLidarrTest(null)
    try {
      const { data } = await api.post('/setup/test/lidarr', { url: lidarrUrl, apiKey: lidarrKey })
      setLidarrTest({ ok: data.ok, message: data.ok ? `Connected — Lidarr v${data.version}` : null, error: data.error })
    } catch { setLidarrTest({ ok: false, error: 'Request failed' }) }
    finally { setLidarrTesting(false) }
  }

  async function testPlex() {
    setPlexTesting(true); setPlexTest(null)
    try {
      const { data } = await api.post('/setup/test/plex', { url: plexUrl, token: plexToken })
      setPlexTest({ ok: data.ok, message: data.ok ? `Connected — ${data.serverName}` : null, error: data.error })
    } catch { setPlexTest({ ok: false, error: 'Request failed' }) }
    finally { setPlexTesting(false) }
  }

  async function testLastfm() {
    setLastfmTesting(true); setLastfmTest(null)
    try {
      const { data } = await api.post('/setup/test/lastfm', { apiKey: lastfmKey })
      setLastfmTest({ ok: data.ok, message: data.ok ? 'Last.fm connected' : null, error: data.error })
    } catch { setLastfmTest({ ok: false, error: 'Request failed' }) }
    finally { setLastfmTesting(false) }
  }

  async function testFanart() {
    setFanartTesting(true); setFanartTest(null)
    try {
      const { data } = await api.post('/setup/test/fanart', { apiKey: fanartKey })
      setFanartTest({ ok: data.ok, message: data.ok ? 'Fanart.tv connected' : null, error: data.error })
    } catch { setFanartTest({ ok: false, error: 'Request failed' }) }
    finally { setFanartTesting(false) }
  }

  // ── Plex users ────────────────────────────────────────
  async function loadPlexUsers() {
    if (!plexUrl || !plexToken) return toast.error('Enter your Plex URL and token first')
    setLoadingUsers(true)
    try {
      const { data } = await api.post('/setup/plex/users', { plexToken, plexUrl })
      setPlexUsers(data.users || [])
      if (data.users?.length) setSelectedUsers(new Set(data.users.map(u => u.plexId)))
      else toast('No Plex users found', { icon: 'ℹ️' })
    } catch { toast.error('Could not fetch Plex users') }
    finally { setLoadingUsers(false) }
  }

  function toggleUser(id) {
    setSelectedUsers(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // ── Finish ────────────────────────────────────────────
  async function finish() {
    setSaving(true)
    try {
      const approved = plexUsers.filter(u => selectedUsers.has(u.plexId))
      await api.post('/setup/complete', {
        lidarrUrl:    lidarrUrl  || null,
        lidarrApiKey: lidarrKey  || null,
        lastfmApiKey: lastfmKey  || null,
        fanartApiKey: fanartKey  || null,
        plexUrl:      plexUrl    || null,
        plexToken:    plexToken  || null,
        approvedUsers: approved,
      })
      toast.success('Setup complete! Welcome to Singarr.')
      if (adminToken && adminUser) login(adminToken, adminUser)
      onComplete()
    } catch { toast.error('Failed to save setup') }
    finally { setSaving(false) }
  }

  const canNext = [!!adminUser, true, true]

  return (
    <div style={s.root}>
      <div style={s.orb1} /><div style={s.orb2} />
      <button onClick={toggle} style={s.themeBtn}>{theme === 'dark' ? '☀️' : '🌙'}</button>

      <div style={s.layout}>
        {/* Sidebar */}
        <div style={s.sidebar}>
          <div style={s.logoRow}>
            <div style={s.logoMark}><IconMusicNote size={20} color="#fff" /></div>
            <span style={s.logoText}>Singarr</span>
          </div>
          <p style={s.setupLabel}>First-time setup</p>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {STEPS.map((st, i) => (
              <div key={st.id}>
                <StepDot step={st} index={i} current={step} />
                {i < STEPS.length - 1 && (
                  <div style={{ width: 2, height: 28, marginLeft: 16, background: i < step ? '#1a7a45' : 'rgba(255,255,255,0.07)', transition: 'background 300ms' }} />
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ fontSize: 11, color: '#55555f', lineHeight: 1.6 }}>
              All API keys are optional and can be added or changed later in <strong style={{ color: '#9898a8' }}>Settings</strong>.
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={s.content}>
          <AnimatePresence mode="wait">
            <motion.div key={step}
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.22 }}
              style={{ flex: 1, overflowY: 'auto' }}
            >

              {/* ── Step 0: Admin ── */}
              {step === 0 && (
                <div>
                  <h2 style={s.stepTitle}>Create your admin account</h2>
                  <p style={s.stepDesc}>
                    This local account is stored directly in Singarr — no Plex required to log in.
                    You can optionally link your Plex account after creating it.
                  </p>

                  {!adminUser ? (
                    <div>
                      <ApiField label="Username" placeholder="admin" value={adminUsername} onChange={setAdminUsername} optional={false} />
                      <ApiField label="Password" type="password" placeholder="At least 8 characters" value={adminPassword} onChange={setAdminPassword} optional={false} />
                      <PasswordStrength password={adminPassword} />
                      <ApiField label="Confirm password" type="password" placeholder="Re-enter password" value={adminConfirm} onChange={setAdminConfirm} optional={false} />
                      {adminError && <div style={s.errorBox}>✕ {adminError}</div>}
                      <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                        onClick={createLocalAdmin} disabled={adminCreating}
                        style={{ ...s.primaryBtn, opacity: adminCreating ? 0.7 : 1 }}>
                        {adminCreating ? <><span style={s.spinner} />Creating…</> : 'Create admin account'}
                      </motion.button>
                    </div>
                  ) : (
                    <div>
                      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={s.adminCard}>
                        <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#1a7a45', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                          {adminUser.username[0].toUpperCase()}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 15, color: '#f0f0f2' }}>{adminUser.username}</div>
                          <div style={{ fontSize: 12, color: '#2dbe6c', fontWeight: 600 }}>Local admin account ✓</div>
                        </div>
                        <IconCheck size={20} color="#2dbe6c" />
                      </motion.div>

                      <div style={s.optionalBox}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#f0f0f2' }}>Link Plex account</span>
                          <span style={s.optTag}>OPTIONAL</span>
                        </div>
                        <p style={{ fontSize: 12, color: '#9898a8', marginBottom: 12, lineHeight: 1.6 }}>
                          Link your Plex account so you can also sign in with Plex. Your local credentials always work independently.
                        </p>
                        {!plexLinked ? (
                          <button onClick={linkPlex} disabled={plexLinking}
                            style={{ ...s.plexBtn, opacity: plexLinking ? 0.75 : 1 }}>
                            {plexLinking
                              ? <><span style={{ ...s.spinner, borderTopColor: '#000' }} />Waiting for Plex…</>
                              : <><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 19.2L5.4 12 12 4.8 18.6 12 12 19.2z"/></svg>Link with Plex</>
                            }
                          </button>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2dbe6c', fontSize: 13 }}>
                            <IconCheck size={15} color="#2dbe6c" />Plex account linked
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Step 1: Services / API Keys ── */}
              {step === 1 && (
                <div>
                  <h2 style={s.stepTitle}>Connect your services</h2>
                  <p style={s.stepDesc}>
                    All fields are optional — skip anything that isn't set up yet and add it later in <strong style={{ color: '#f0f0f2' }}>Settings</strong>. Use the Test buttons to verify each connection before continuing.
                  </p>

                  {/* Lidarr */}
                  <div style={s.serviceBlock}>
                    <div style={s.serviceHeader}>
                      <IconDownload size={14} color="#2dbe6c" />
                      <span style={s.serviceTitle}>Lidarr</span>
                      <span style={s.optTag}>OPTIONAL</span>
                      <span style={s.serviceDesc}>Handles music acquisition</span>
                    </div>
                    <ApiField
                      label="Lidarr URL" placeholder="http://192.168.1.100:8686"
                      value={lidarrUrl} onChange={v => { setLidarrUrl(v); setLidarrTest(null) }}
                      hint="Settings → General → Host in Lidarr"
                    />
                    <ApiField
                      label="Lidarr API Key" placeholder="Your Lidarr API key"
                      value={lidarrKey} onChange={v => { setLidarrKey(v); setLidarrTest(null) }}
                      hint="Settings → General → Security in Lidarr"
                      onTest={testLidarr} testing={lidarrTesting} testResult={lidarrTest}
                    />
                  </div>

                  {/* Plex */}
                  <div style={s.serviceBlock}>
                    <div style={s.serviceHeader}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#2dbe6c"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 19.2L5.4 12 12 4.8 18.6 12 12 19.2z"/></svg>
                      <span style={s.serviceTitle}>Plex</span>
                      <span style={s.optTag}>OPTIONAL</span>
                      <span style={s.serviceDesc}>Library awareness &amp; user import</span>
                    </div>
                    <ApiField
                      label="Plex Server URL" placeholder="http://192.168.1.100:32400"
                      value={plexUrl} onChange={v => { setPlexUrl(v); setPlexTest(null) }}
                    />
                    <ApiField
                      label="Plex Token" placeholder="Your Plex token"
                      hint={<>Find yours at <a href="https://support.plex.tv/articles/204059436" target="_blank" rel="noopener" style={{ color: '#2dbe6c' }}>support.plex.tv</a></>}
                      value={plexToken} onChange={v => { setPlexToken(v); setPlexTest(null) }}
                      onTest={testPlex} testing={plexTesting} testResult={plexTest}
                    />
                  </div>

                  {/* Last.fm */}
                  <div style={s.serviceBlock}>
                    <div style={s.serviceHeader}>
                      <IconMusicNote size={14} color="#2dbe6c" />
                      <span style={s.serviceTitle}>Last.fm</span>
                      <span style={s.optTag}>OPTIONAL</span>
                      <span style={s.serviceDesc}>Artist images &amp; bios</span>
                      <a href="https://www.last.fm/api/account/create" target="_blank" rel="noopener" style={s.getKeyLink}>Get free key →</a>
                    </div>
                    <ApiField
                      label="Last.fm API Key" placeholder="32-character API key"
                      value={lastfmKey} onChange={v => { setLastfmKey(v); setLastfmTest(null) }}
                      onTest={testLastfm} testing={lastfmTesting} testResult={lastfmTest}
                    />
                  </div>

                  {/* Fanart.tv */}
                  <div style={s.serviceBlock}>
                    <div style={s.serviceHeader}>
                      <IconDisc size={14} color="#2dbe6c" />
                      <span style={s.serviceTitle}>Fanart.tv</span>
                      <span style={s.optTag}>OPTIONAL</span>
                      <span style={s.serviceDesc}>HD artist art &amp; banners</span>
                      <a href="https://fanart.tv/get-an-api-key" target="_blank" rel="noopener" style={s.getKeyLink}>Get free key →</a>
                    </div>
                    <ApiField
                      label="Fanart.tv API Key" placeholder="API key"
                      value={fanartKey} onChange={v => { setFanartKey(v); setFanartTest(null) }}
                      onTest={testFanart} testing={fanartTesting} testResult={fanartTest}
                    />
                  </div>
                </div>
              )}

              {/* ── Step 2: Users ── */}
              {step === 2 && (
                <div>
                  <h2 style={s.stepTitle}>Import Plex users</h2>
                  <p style={s.stepDesc}>
                    Import your Plex friends and home users so they can log in. Completely optional — manage users any time from the Admin panel.
                  </p>

                  {!plexUrl || !plexToken ? (
                    <div style={{ padding: '16px', background: 'rgba(79,156,249,0.07)', border: '1px solid rgba(79,156,249,0.2)', borderRadius: 10, fontSize: 13, color: '#9898a8' }}>
                      ℹ You didn't enter Plex credentials in the previous step — user import isn't available. You can add users manually from <strong style={{ color: '#f0f0f2' }}>Settings → Users</strong> after setup.
                    </div>
                  ) : (
                    <div>
                      <button onClick={loadPlexUsers} disabled={loadingUsers}
                        style={{ ...s.loadBtn, marginBottom: 16, opacity: loadingUsers ? 0.7 : 1 }}>
                        {loadingUsers
                          ? <><span style={s.spinner} />Loading…</>
                          : <><IconHeadphones size={14} color="currentColor" />Fetch Plex users</>
                        }
                      </button>

                      {plexUsers.length > 0 && (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <span style={{ fontSize: 12, color: '#9898a8' }}>{selectedUsers.size} of {plexUsers.length} selected</span>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button style={s.selBtn} onClick={() => setSelectedUsers(new Set(plexUsers.map(u => u.plexId)))}>All</button>
                              <button style={s.selBtn} onClick={() => setSelectedUsers(new Set())}>None</button>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 240, overflowY: 'auto' }}>
                            {plexUsers.map(u => {
                              const checked = selectedUsers.has(u.plexId)
                              return (
                                <div key={u.plexId} onClick={() => toggleUser(u.plexId)} style={{
                                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer',
                                  border: `1px solid ${checked ? '#1a7a45' : 'rgba(255,255,255,0.07)'}`,
                                  background: checked ? 'rgba(26,122,69,0.1)' : '#18181c',
                                  borderRadius: 9, transition: 'all 150ms',
                                }}>
                                  <div style={{ position: 'relative', flexShrink: 0 }}>
                                    {u.avatar
                                      ? <img src={u.avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
                                      : <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1a7a45', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>{u.username[0]?.toUpperCase()}</div>
                                    }
                                    {checked && <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(26,122,69,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconCheck size={12} color="#fff" /></div>}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#f0f0f2' }}>{u.username}</div>
                                    {u.email && <div style={{ fontSize: 11, color: '#55555f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>}
                                  </div>
                                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: '2px 7px', borderRadius: 999, background: u.source === 'home' ? 'rgba(79,156,249,0.12)' : 'rgba(255,255,255,0.05)', color: u.source === 'home' ? '#4f9cf9' : '#9898a8' }}>{u.source}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <p style={{ fontSize: 11, color: '#55555f', marginTop: 14 }}>You can always add or remove users later from Settings → Users.</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Nav */}
          <div style={s.navRow}>
            {step > 0 && <button onClick={() => setStep(s => s - 1)} style={s.backBtn}>← Back</button>}
            <div style={{ flex: 1 }} />
            {step < STEPS.length - 1 ? (
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={() => setStep(s => s + 1)} disabled={!canNext[step]}
                style={{ ...s.nextBtn, opacity: canNext[step] ? 1 : 0.4 }}>
                {step === 1 ? 'Skip / Continue →' : 'Continue →'}
              </motion.button>
            ) : (
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={finish} disabled={saving}
                style={{ ...s.nextBtn, opacity: saving ? 0.75 : 1 }}>
                {saving ? <><span style={s.spinner} />Saving…</> : '✓ Complete Setup'}
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const s = {
  root: { minHeight: '100vh', background: '#0a0a0b', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', padding: 20 },
  orb1: { position: 'absolute', top: '-10%', left: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(26,122,69,0.1) 0%, transparent 70%)', filter: 'blur(40px)', pointerEvents: 'none' },
  orb2: { position: 'absolute', bottom: '-15%', right: '-5%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(45,190,108,0.07) 0%, transparent 70%)', filter: 'blur(60px)', pointerEvents: 'none' },
  themeBtn: { position: 'absolute', top: 20, right: 20, background: '#18181c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '50%', width: 40, height: 40, cursor: 'pointer', fontSize: 18, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  layout: { display: 'flex', background: '#18181c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 22, boxShadow: '0 32px 80px rgba(0,0,0,0.4)', width: '100%', maxWidth: 860, minHeight: 580, overflow: 'hidden', position: 'relative', zIndex: 1 },
  sidebar: { width: 210, flexShrink: 0, background: '#111113', borderRight: '1px solid rgba(255,255,255,0.07)', padding: '28px 20px', display: 'flex', flexDirection: 'column' },
  logoRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 },
  logoMark: { width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#1a7a45,#2dbe6c)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(26,122,69,0.35)', flexShrink: 0 },
  logoText: { fontSize: 16, fontWeight: 800, color: '#f0f0f2', letterSpacing: '-0.3px' },
  setupLabel: { fontSize: 10, fontWeight: 700, color: '#55555f', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 22, marginTop: 4 },
  content: { flex: 1, padding: '32px 36px', display: 'flex', flexDirection: 'column', background: '#0f0f12', overflow: 'hidden' },
  stepTitle: { fontSize: 20, fontWeight: 800, color: '#f0f0f2', letterSpacing: '-0.4px', marginBottom: 8 },
  stepDesc: { fontSize: 13, color: '#9898a8', lineHeight: 1.65, marginBottom: 20 },
  label: { fontSize: 12, fontWeight: 600, color: '#9898a8' },
  hint: { fontSize: 11, color: '#55555f', marginBottom: 6, marginTop: -2 },
  optTag: { fontSize: 10, color: '#55555f', background: 'rgba(255,255,255,0.06)', padding: '1px 7px', borderRadius: 999, fontWeight: 600, letterSpacing: '0.04em' },
  input: { flex: 1, padding: '10px 13px', background: '#1e1e22', border: '1px solid rgba(255,255,255,0.13)', borderRadius: 8, color: '#f0f0f2', fontSize: 13, fontFamily: "'Segoe UI',sans-serif", outline: 'none', width: '100%' },
  testBtn: { padding: '10px 13px', flexShrink: 0, background: 'rgba(26,122,69,0.15)', border: '1px solid #1a7a45', borderRadius: 8, color: '#2dbe6c', fontSize: 11, fontWeight: 700, fontFamily: "'Segoe UI',sans-serif", cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' },
  primaryBtn: { padding: '12px 22px', background: '#1a7a45', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: "'Segoe UI',sans-serif", cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 },
  adminCard: { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: 'rgba(26,122,69,0.12)', border: '1px solid rgba(26,122,69,0.35)', borderRadius: 12, marginBottom: 18 },
  optionalBox: { background: '#18181c', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '16px 18px', marginBottom: 12 },
  plexBtn: { padding: '11px 18px', background: '#e5a00d', border: 'none', borderRadius: 9, color: '#000', fontSize: 13, fontWeight: 700, fontFamily: "'Segoe UI',sans-serif", cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 },
  serviceBlock: { background: '#18181c', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '16px 18px', marginBottom: 12 },
  serviceHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  serviceTitle: { fontSize: 13, fontWeight: 700, color: '#f0f0f2' },
  serviceDesc: { fontSize: 11, color: '#55555f', marginLeft: 2 },
  getKeyLink: { marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: '#2dbe6c', textDecoration: 'none' },
  loadBtn: { padding: '10px 16px', background: 'rgba(26,122,69,0.15)', border: '1px solid #1a7a45', borderRadius: 9, color: '#2dbe6c', fontSize: 13, fontWeight: 700, fontFamily: "'Segoe UI',sans-serif", cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 },
  selBtn: { padding: '4px 10px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#9898a8', fontSize: 11, fontFamily: "'Segoe UI',sans-serif", cursor: 'pointer' },
  errorBox: { padding: '9px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 9, color: '#ef4444', fontSize: 13, marginBottom: 12 },
  navRow: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto', paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.07)' },
  backBtn: { padding: '10px 18px', background: '#1e1e22', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#9898a8', fontSize: 13, fontWeight: 600, fontFamily: "'Segoe UI',sans-serif", cursor: 'pointer' },
  nextBtn: { padding: '11px 22px', background: '#1a7a45', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: "'Segoe UI',sans-serif", cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 },
  spinner: { width: 14, height: 14, border: '2px solid rgba(255,255,255,0.25)', borderTopColor: 'currentColor', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block', flexShrink: 0 },
}
