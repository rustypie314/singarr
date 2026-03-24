import { useEffect, useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { IconRefresh, IconMusicNote, IconDisc, IconMicrophone, IconHeadphones, IconCheck, IconDownload } from '../components/Icons.jsx'
import toast from 'react-hot-toast'
import { formatDateShort } from '../utils/date.js'

export default function Admin() {
  const { api, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [tab, setTab] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('tab') || 'overview'
  })
  const [stats, setStats] = useState(null)
  const [settings, setSettings] = useState(null)
  const savedSettings = useRef(null)
  const isDirty = settings !== null && savedSettings.current !== null &&
    JSON.stringify(settings) !== JSON.stringify(savedSettings.current)
  const [users, setUsers] = useState([])
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // Plex user import
  const [plexModalOpen, setPlexModalOpen] = useState(false)
  const [plexImportUsers, setPlexImportUsers] = useState([])
  const [selectedPlexUsers, setSelectedPlexUsers] = useState(new Set())
  const [loadingPlexUsers, setLoadingPlexUsers] = useState(false)
  const [importingPlex, setImportingPlex] = useState(false)

  // API key test states
  const [tests, setTests] = useState({})
  const [testing, setTesting] = useState({})

  async function loadPlexUsersForImport() {
    setLoadingPlexUsers(true)
    try {
      const plexUrl = settings?.plex_url
      const plexToken = settings?.plex_token
      if (!plexUrl || !plexToken) return toast.error('Configure Plex URL and token in the Services tab first')
      const { data } = await api.post('/setup/plex/users', { plexUrl, plexToken })
      const incoming = data.users || []
      if (!incoming.length) return toast('No Plex users found on your server', { icon: 'ℹ️' })
      const existingPlexIds = new Set(users.filter(u => u.plex_id).map(u => String(u.plex_id)))
      const newUsers = incoming.filter(u => !existingPlexIds.has(String(u.plexId)))
      if (!newUsers.length) return toast('All your Plex users have already been imported', { icon: 'ℹ️' })
      setPlexImportUsers(newUsers)
      setSelectedPlexUsers(new Set(newUsers.map(u => u.plexId)))
      setPlexModalOpen(true)
    } catch { toast.error('Could not fetch Plex users') }
    finally { setLoadingPlexUsers(false) }
  }

  async function importSelectedPlexUsers() {
    setImportingPlex(true)
    try {
      const toImport = plexImportUsers.filter(u => selectedPlexUsers.has(u.plexId))
      await api.post('/setup/complete', { approvedUsers: toImport })
      toast.success(`Imported ${toImport.length} user${toImport.length !== 1 ? 's' : ''}`)
      setPlexModalOpen(false)
      setPlexImportUsers([])
      setSelectedPlexUsers(new Set())
      fetchUsers()
    } catch { toast.error('Import failed') }
    finally { setImportingPlex(false) }
  }

  function togglePlexUser(id) {
    setSelectedPlexUsers(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function testConnection(type) {
    setTesting(t => ({ ...t, [type]: true }))
    setTests(t => ({ ...t, [type]: null }))
    try {
      let result
      if (type === 'lidarr') {
        const { data } = await api.post('/setup/test/lidarr', {
          url: settings.lidarr_url, apiKey: settings.lidarr_api_key
        })
        result = { ok: data.ok, message: data.ok ? `Connected — Lidarr v${data.version}` : null, error: data.error }
      } else if (type === 'plex') {
        const { data } = await api.post('/setup/test/plex', {
          url: settings.plex_url, token: settings.plex_token
        })
        result = { ok: data.ok, message: data.ok ? `Connected — ${data.serverName}` : null, error: data.error }
      } else if (type === 'lastfm') {
        const { data } = await api.post('/setup/test/lastfm', { apiKey: settings.lastfm_api_key })
        result = { ok: data.ok, message: data.ok ? 'Last.fm connected' : null, error: data.error }
      } else if (type === 'fanart') {
        const { data } = await api.post('/setup/test/fanart', { apiKey: settings.fanart_api_key })
        result = { ok: data.ok, message: data.ok ? 'Fanart.tv connected' : null, error: data.error }
      }
      setTests(t => ({ ...t, [type]: result }))
    } catch {
      setTests(t => ({ ...t, [type]: { ok: false, error: 'Request failed' } }))
    } finally {
      setTesting(t => ({ ...t, [type]: false }))
    }
  }

  useEffect(() => {
    fetchStats()
    fetchSettings()
    fetchUsers()
  }, [])

  async function fetchStats() {
    try { const r = await api.get('/admin/stats'); setStats(r.data) } catch {}
  }
  async function fetchSettings() {
    try {
      const r = await api.get('/admin/settings')
      setSettings(r.data.settings)
      savedSettings.current = r.data.settings
    } catch {}
  }
  async function fetchUsers() {
    try { const r = await api.get('/admin/users'); setUsers(r.data.users) } catch {}
  }

  async function saveSettings() {
    setSaving(true)
    try {
      await api.put('/admin/settings', { settings })
      savedSettings.current = { ...settings }
      toast.success('Settings saved')
    } catch { toast.error('Failed to save settings') }
    finally { setSaving(false) }
  }

  async function updateUser(id, data) {
    try {
      await api.put(`/admin/users/${id}`, data)
      toast.success('User updated')
      fetchUsers()
    } catch { toast.error('Failed to update user') }
  }

  // User edit/select mode
  const [editMode, setEditMode] = useState(false)
  const [selectedUserIds, setSelectedUserIds] = useState(new Set())
  const [confirmDelete, setConfirmDelete] = useState(null) // { users: [...] }

  function toggleSelectUser(id) {
    setSelectedUserIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function exitEditMode() {
    setEditMode(false)
    setSelectedUserIds(new Set())
  }

  function promptRemoveSelected(userList) {
    const toRemove = userList.filter(u => selectedUserIds.has(u.id))
    setConfirmDelete({ users: toRemove })
  }

  async function confirmDeleteUsers() {
    const { users: toRemove } = confirmDelete
    setConfirmDelete(null)
    try {
      await Promise.all(toRemove.map(u => api.delete(`/admin/users/${u.id}`)))
      toast.success(`Removed ${toRemove.length} user${toRemove.length !== 1 ? 's' : ''}`)
      exitEditMode()
      fetchUsers()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to remove users')
    }
  }

  async function updateRequest(id, status) {
    try {
      await api.put(`/admin/requests/${id}`, { status })
      toast.success('Request updated')
      } catch { toast.error('Failed to update request') }
  }

  async function syncPlex() {
    setSyncing(true)
    try {
      await api.post('/plex/sync')
      toast.success('Plex library synced!')
      fetchStats()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const TABS = ['overview', 'services', 'requests', 'users', 'notifications', 'metadata', 'account', 'analytics']

  const [showDirtyModal, setShowDirtyModal] = useState(false)
  const pendingNav = useRef(null)

  // Intercept sidebar nav clicks when dirty
  function guardedNavigate(to) {
    if (isDirty) {
      pendingNav.current = () => navigate(to)
      setShowDirtyModal(true)
    } else {
      navigate(to)
    }
  }

  // Warn on browser tab close/refresh
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (!isDirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  // Intercept clicks on sidebar links when dirty
  useEffect(() => {
    if (!isDirty) return
    function handleClick(e) {
      const link = e.target.closest('a[href]')
      if (!link) return
      const href = link.getAttribute('href')
      if (!href || href === location.pathname || href.startsWith('http')) return
      e.preventDefault()
      e.stopPropagation()
      pendingNav.current = () => navigate(href)
      setShowDirtyModal(true)
    }
    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [isDirty, location.pathname])

  return (
    <div style={styles.root}>

      {/* Unsaved changes dialog */}
      {showDirtyModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: 28, maxWidth: 400, width: '100%', boxShadow: '0 32px 64px rgba(0,0,0,0.4)' }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>⚠️</div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Unsaved changes</h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
              You have unsaved changes in Settings. If you leave now, your changes will be lost.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowDirtyModal(false); pendingNav.current = null }}
                style={{ flex: 1, padding: 11, background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-sans)', cursor: 'pointer' }}>
                Stay
              </button>
              <button onClick={() => { setShowDirtyModal(false); if (pendingNav.current) { pendingNav.current(); pendingNav.current = null } }}
                style={{ flex: 1, padding: 11, background: 'none', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 'var(--radius-md)', color: '#ef4444', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-sans)', cursor: 'pointer' }}>
                Leave & Discard
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>Settings</h1>
          <p style={styles.pageSubtitle}>Manage Singarr settings and users</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabBar}>
        {TABS.map(t => {
          const labels = { overview:'Overview', services:'Services', requests:'Requests', users:'Users', notifications:'Notifications', metadata:'Metadata Providers', account:'Account', analytics:'Analytics' }
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              ...styles.tabBtn,
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
            }}>
              {labels[t] || t}
            </button>
          )
        })}
      </div>

      {/* Overview */}
      {tab === 'overview' && stats && (
        <div style={styles.section}>
          <div style={styles.statsGrid}>
            {[
              { label: 'Total Requests', value: stats.totalRequests,   Icon: IconHeadphones },
              { label: 'Pending',        value: stats.pendingRequests,  Icon: IconMusicNote  },
              { label: 'Downloaded',     value: stats.downloadedRequests, Icon: IconDisc     },
              { label: 'Users',          value: stats.totalUsers,       Icon: IconMicrophone },
              { label: 'Plex Library',   value: stats.plexCacheCount,   Icon: IconDisc       },
            ].map(s => (
              <div key={s.label} style={styles.statCard}>
                <div style={styles.statIconWrap}>
                  <s.Icon size={22} color="var(--accent)" />
                </div>
                <div style={styles.statValue}>{s.value}</div>
                <div style={styles.statLabel}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <h3 style={styles.cardTitle}>Plex Library</h3>
              <button onClick={syncPlex} disabled={syncing} style={{ ...styles.actionBtn, opacity: syncing ? 0.8 : 1, cursor: syncing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                {syncing
                  ? <><span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'currentColor', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block', flexShrink: 0 }} /> Syncing…</>
                  : <><IconRefresh size={13} color="currentColor" /> Sync Now</>
                }
              </button>
            </div>
            <p style={styles.cardDesc}>
              Singarr caches your Plex music library to prevent duplicate requests.
              Auto-syncs hourly.
            </p>
          </div>

          {stats.recentRequests?.length > 0 && (
            <div style={styles.card}>
              <h3 style={{ ...styles.cardTitle, marginBottom: '14px' }}>Recent Requests</h3>
              {stats.recentRequests.map(r => (
                <div key={r.id} style={styles.miniRow}>
                  <span style={styles.miniType}>{r.type}</span>
                  <span style={styles.miniTitle}>{r.title}</span>
                  <span style={styles.miniUser}>{r.username}</span>
                  <StatusBadge status={r.status} size="sm" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Services */}
      {tab === 'services' && settings && (
        <div style={styles.section}>

          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Services & API Keys</h3>
            <p style={styles.cardDesc}>Configure external services. Changes take effect immediately — no restart needed.</p>

            {/* Lidarr */}
            <div style={styles.apiSection}>
              <div style={styles.apiSectionHeader}>
                <IconDownload size={13} color="var(--accent)" />
                <span style={styles.apiSectionTitle}>Lidarr</span>
              </div>
              <div style={styles.apiRow}>
                <div style={{ flex: 1 }}>
                  <label style={styles.fieldLabel}>URL</label>
                  <input type="text" placeholder="http://192.168.1.100:8686" style={styles.fieldInput}
                    value={settings.lidarr_url || ''} onChange={e => setSettings(s => ({ ...s, lidarr_url: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.fieldLabel}>API Key</label>
                  <input type="password" placeholder="Your Lidarr API key" style={styles.fieldInput} autoComplete="off"
                    value={settings.lidarr_api_key || ''} onChange={e => setSettings(s => ({ ...s, lidarr_api_key: e.target.value }))} />
                </div>
                <div style={styles.testCol}>
                  <label style={{ ...styles.fieldLabel, opacity: 0 }}>Test</label>
                  <button onClick={() => testConnection('lidarr')} disabled={testing.lidarr || !settings.lidarr_url || !settings.lidarr_api_key}
                    style={{ ...styles.testConnBtn, opacity: (!settings.lidarr_url || !settings.lidarr_api_key) ? 0.4 : 1 }}>
                    {testing.lidarr ? <span style={styles.spinner} /> : <IconRefresh size={13} color="currentColor" />}
                    Test
                  </button>
                </div>
              </div>
              <TestPill result={tests.lidarr} />
            </div>

            {/* Plex */}
            <div style={styles.apiSection}>
              <div style={styles.apiSectionHeader}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--accent)"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 19.2L5.4 12 12 4.8 18.6 12 12 19.2z"/></svg>
                <span style={styles.apiSectionTitle}>Plex</span>
              </div>
              <div style={styles.apiRow}>
                <div style={{ flex: 1 }}>
                  <label style={styles.fieldLabel}>Server URL</label>
                  <input type="text" placeholder="http://192.168.1.100:32400" style={styles.fieldInput}
                    value={settings.plex_url || ''} onChange={e => setSettings(s => ({ ...s, plex_url: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.fieldLabel}>Plex Token</label>
                  <input type="password" placeholder="Your Plex token" style={styles.fieldInput} autoComplete="off"
                    value={settings.plex_token || ''} onChange={e => setSettings(s => ({ ...s, plex_token: e.target.value }))} />
                </div>
                <div style={styles.testCol}>
                  <label style={{ ...styles.fieldLabel, opacity: 0 }}>Test</label>
                  <button onClick={() => testConnection('plex')} disabled={testing.plex || !settings.plex_url || !settings.plex_token}
                    style={{ ...styles.testConnBtn, opacity: (!settings.plex_url || !settings.plex_token) ? 0.4 : 1 }}>
                    {testing.plex ? <span style={styles.spinner} /> : <IconRefresh size={13} color="currentColor" />}
                    Test
                  </button>
                </div>
              </div>
              <TestPill result={tests.plex} />

              <div style={{ marginTop: 14 }}>
                <label style={styles.fieldLabel}>Open In Plex via</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  {[
                    { value: 'web',   label: 'Plex Web (app.plex.tv)' },
                    { value: 'local', label: 'Local Server' },
                    { value: 'both',  label: 'Both' },
                  ].map(opt => (
                    <button key={opt.value}
                      onClick={() => setSettings(s => ({ ...s, plex_open_mode: opt.value }))}
                      style={{
                        padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                        fontFamily: 'var(--font-sans)', cursor: 'pointer', border: '1px solid',
                        background: settings.plex_open_mode === opt.value ? 'var(--accent-muted)' : 'transparent',
                        color: settings.plex_open_mode === opt.value ? 'var(--accent)' : 'var(--text-secondary)',
                        borderColor: settings.plex_open_mode === opt.value ? 'var(--accent)' : 'var(--border)',
                      }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(79,156,249,0.07)', border: '1px solid rgba(79,156,249,0.18)', borderRadius: 9, fontSize: 12, color: 'var(--text-secondary)' }}>
              ℹ After saving Plex credentials, trigger a <strong style={{ color: 'var(--text-primary)' }}>Plex Library Sync</strong> from the Overview tab to update your library cache. Last.fm and Fanart.tv keys are configured under the <strong style={{ color: 'var(--text-primary)' }}>Metadata Providers</strong> tab.
            </div>
          </div>

          <button onClick={saveSettings} disabled={saving || !isDirty} style={{ ...styles.saveBtn, opacity: (!isDirty || saving) ? 0.4 : 1, cursor: (!isDirty || saving) ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      )}

      {/* Requests tab */}
      {tab === 'requests' && settings && (
        <div style={styles.section}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Request Types</h3>
            <p style={styles.cardDesc}>Control what types of music users can request.</p>
            <div style={styles.toggleGroup}>
              {[
                { key: 'allow_artist_requests',  label: 'Artist Requests',        desc: 'Allow requesting entire artist discographies' },
                { key: 'allow_album_requests',   label: 'Album Requests',         desc: 'Allow requesting individual albums' },
                { key: 'allow_track_requests',   label: 'Track Requests',         desc: 'Allow requesting individual tracks' },
                { key: 'require_approval',       label: 'Require Admin Approval', desc: 'New requests need admin approval before going to Lidarr' },
                { key: 'auto_approve_plex_users', label: 'Auto-approve Plex Users', desc: 'New Plex users are automatically approved' },
              ].map(({ key, label, desc }) => (
                <div key={key} style={styles.toggleRow}>
                  <div>
                    <div style={styles.toggleLabel}>{label}</div>
                    <div style={styles.toggleDesc}>{desc}</div>
                  </div>
                  <Toggle
                    value={settings[key] === 'true'}
                    onChange={v => setSettings(s => ({ ...s, [key]: String(v) }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Request Limits</h3>
            <p style={styles.cardDesc}>Global defaults. Override per-user in the Users tab. Set to 0 for unlimited.</p>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Global Defaults</div>
            <div style={styles.fieldGroup}>
              <div style={styles.field}>
                <label style={styles.fieldLabel}>Album requests per window</label>
                <input type="number" min="0" max="999" style={styles.fieldInput}
                  value={settings.global_album_limit ?? '10'}
                  onChange={e => setSettings(s => ({ ...s, global_album_limit: e.target.value }))} />
              </div>
              <div style={styles.field}>
                <label style={styles.fieldLabel}>Track requests per window</label>
                <input type="number" min="0" max="999" style={styles.fieldInput}
                  value={settings.global_track_limit ?? '20'}
                  onChange={e => setSettings(s => ({ ...s, global_track_limit: e.target.value }))} />
              </div>
              <div style={styles.field}>
                <label style={styles.fieldLabel}>Window (days)</label>
                <input type="number" min="1" max="365" style={styles.fieldInput}
                  value={settings.global_request_limit_days || '7'}
                  onChange={e => setSettings(s => ({ ...s, global_request_limit_days: e.target.value }))} />
              </div>
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-secondary)', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 7, borderLeft: '2px solid var(--accent)' }}>
              Artist requests count against the album limit. Per-user overrides can be set individually in the Users tab.
            </div>
          </div>

          <button onClick={saveSettings} disabled={saving || !isDirty}
            style={{ ...styles.saveBtn, alignSelf: 'flex-start', opacity: (!isDirty || saving) ? 0.4 : 1, cursor: (!isDirty || saving) ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      )}

      {/* Users */}
      {tab === 'users' && (
        <div style={styles.section}>

          {/* Plex import */}
          <div style={styles.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ ...styles.cardTitle, marginBottom: 2 }}>Import Plex Users</h3>
                <p style={{ ...styles.cardDesc, marginBottom: 0 }}>Pull friends and home users from your Plex server.</p>
              </div>
              <button onClick={loadPlexUsersForImport} disabled={loadingPlexUsers}
                style={{ ...styles.testConnBtn, opacity: loadingPlexUsers ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                {loadingPlexUsers ? <span style={styles.spinner} /> : <IconRefresh size={13} color="currentColor" />}
                Fetch Plex users
              </button>
            </div>
          </div>
          <div style={styles.card}>
            {(() => {
              const localUsers = users.filter(u => u.is_local_admin || (!u.plex_id))
              const plexUsers = users.filter(u => u.plex_id && !u.is_local_admin)
              const removableSelected = [...selectedUserIds].filter(id => {
                const u = users.find(u => u.id === id)
                return u && !u.is_local_admin
              })

              const UserRow = ({ u }) => (
                <div key={u.id} style={styles.userRow}>
                  {editMode && !u.is_local_admin && (
                    <div onClick={() => toggleSelectUser(u.id)} style={{
                      width: 20, height: 20, borderRadius: 6, flexShrink: 0, cursor: 'pointer',
                      border: `2px solid ${selectedUserIds.has(u.id) ? 'var(--accent)' : 'var(--border-strong)'}`,
                      background: selectedUserIds.has(u.id) ? 'var(--accent)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 120ms',
                    }}>
                      {selectedUserIds.has(u.id) && <IconCheck size={12} color="#fff" />}
                    </div>
                  )}
                  <div style={styles.userAvatarWrap}>
                    {u.avatar
                      ? <img src={u.avatar} alt="" style={styles.userAvatar} />
                      : <div style={styles.userAvatarFallback}>{u.username?.[0]?.toUpperCase()}</div>
                    }
                  </div>
                  <div style={styles.userInfo}>
                    <div style={styles.userName}>{u.username}</div>
                    <div style={styles.userMeta}>
                      {u.email && <>{u.email} · </>}{u.total_requests} requests
                      {u.album_limit_override != null && <span style={{ color: 'var(--accent)' }}> · Albums: {u.album_limit_override === 0 ? '∞' : u.album_limit_override}</span>}
                      {u.track_limit_override != null && <span style={{ color: 'var(--accent)' }}> · Tracks: {u.track_limit_override === 0 ? '∞' : u.track_limit_override}</span>}
                    </div>
                  </div>
                  <div style={{ ...styles.userActions, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Albums</label>
                      <select style={styles.select} value={u.album_limit_override ?? ''}
                        onChange={e => updateUser(u.id, { albumLimitOverride: e.target.value === '' ? null : Number(e.target.value) })}>
                        <option value="">Global</option>
                        {[0,2,5,10,20,50,100].map(n => <option key={n} value={n}>{n === 0 ? 'Unlimited' : n}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tracks</label>
                      <select style={styles.select} value={u.track_limit_override ?? ''}
                        onChange={e => updateUser(u.id, { trackLimitOverride: e.target.value === '' ? null : Number(e.target.value) })}>
                        <option value="">Global</option>
                        {[0,5,10,20,50,100,200].map(n => <option key={n} value={n}>{n === 0 ? 'Unlimited' : n}</option>)}
                      </select>
                    </div>
                    {!u.is_local_admin && <Toggle value={!!u.is_approved} onChange={v => updateUser(u.id, { isApproved: v })} label="Approved" />}
                    {!u.is_local_admin && <Toggle value={!!u.is_admin} onChange={v => updateUser(u.id, { isAdmin: v })} label="Admin" />}
                  </div>
                </div>
              )

              return (
                <>
                  {/* Header with Edit / Remove */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <h3 style={styles.cardTitle}>Users ({users.length})</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {editMode && (
                        <button
                          onClick={() => promptRemoveSelected(plexUsers)}
                          disabled={removableSelected.length === 0}
                          style={{
                            padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: removableSelected.length === 0 ? 'default' : 'pointer',
                            background: removableSelected.length > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${removableSelected.length > 0 ? 'rgba(239,68,68,0.5)' : 'var(--border)'}`,
                            borderRadius: 'var(--radius-sm)', color: removableSelected.length > 0 ? '#ef4444' : 'var(--text-muted)',
                            fontFamily: 'var(--font-sans)', transition: 'all 150ms',
                          }}>
                          Remove{removableSelected.length > 0 ? ` (${removableSelected.length})` : ''}
                        </button>
                      )}
                      {editMode && plexUsers.length > 0 && (
                        <button
                          onClick={() => {
                            if (removableSelected.length === plexUsers.length) {
                              setSelectedUserIds(new Set())
                            } else {
                              setSelectedUserIds(new Set(plexUsers.map(u => u.id)))
                            }
                          }}
                          style={{ ...styles.selBtn, padding: '7px 14px', fontSize: 12 }}>
                          {removableSelected.length === plexUsers.length ? 'Deselect all' : 'Select all'}
                        </button>
                      )}
                      <button
                        onClick={() => editMode ? exitEditMode() : setEditMode(true)}
                        disabled={!editMode && plexUsers.length === 0}
                        style={{ ...styles.testConnBtn, padding: '7px 14px', opacity: (!editMode && plexUsers.length === 0) ? 0.4 : 1, cursor: (!editMode && plexUsers.length === 0) ? 'default' : 'pointer' }}>
                        {editMode ? 'Done' : 'Edit Users'}
                      </button>
                    </div>
                  </div>

                  {/* Local Accounts */}
                  {localUsers.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Local Accounts</div>
                      <div style={{ background: 'var(--bg-overlay)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', padding: '0 12px' }}>
                        {localUsers.map(u => <UserRow key={u.id} u={u} />)}
                      </div>
                    </div>
                  )}

                  {/* Plex Users */}
                  {plexUsers.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Plex Users</div>
                      <div style={{ background: 'var(--bg-overlay)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', padding: '0 12px' }}>
                        {plexUsers.map(u => <UserRow key={u.id} u={u} />)}
                      </div>
                    </div>
                  )}

                  {plexUsers.length === 0 && localUsers.length === 0 && (
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>No users yet.</div>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Requests */}
      {/* Notifications tab */}
      {tab === 'notifications' && settings && (
        <div style={styles.section}>
          <NotificationsTab api={api} settings={settings} setSettings={setSettings} saveSettings={saveSettings} saving={saving} />
        </div>
      )}

      {/* Metadata Providers tab */}
      {tab === 'metadata' && settings && (
        <div style={styles.section}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Metadata Providers</h3>
            <p style={styles.cardDesc}>API keys for artwork and artist info. Both are free and optional — images will show a placeholder if unconfigured.</p>

            {/* Last.fm */}
            <div style={styles.apiSection}>
              <div style={styles.apiSectionHeader}>
                <IconMusicNote size={13} color="var(--accent)" />
                <span style={styles.apiSectionTitle}>Last.fm</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 4 }}>Artist images &amp; bios</span>
                <a href="https://www.last.fm/api/account/create" target="_blank" rel="noopener" style={styles.getKeyLink}>Get free key →</a>
              </div>
              <div style={styles.apiRow}>
                <div style={{ flex: 1 }}>
                  <label style={styles.fieldLabel}>API Key</label>
                  <input type="password" placeholder="32-character API key" style={styles.fieldInput} autoComplete="off"
                    value={settings.lastfm_api_key || ''} onChange={e => setSettings(s => ({ ...s, lastfm_api_key: e.target.value }))} />
                </div>
                <div style={styles.testCol}>
                  <label style={{ ...styles.fieldLabel, opacity: 0 }}>Test</label>
                  <button onClick={() => testConnection('lastfm')} disabled={testing.lastfm || !settings.lastfm_api_key}
                    style={{ ...styles.testConnBtn, opacity: !settings.lastfm_api_key ? 0.4 : 1 }}>
                    {testing.lastfm ? <span style={styles.spinner} /> : <IconRefresh size={13} color="currentColor" />}
                    Test
                  </button>
                </div>
              </div>
              <TestPill result={tests.lastfm} />
            </div>

            {/* Fanart.tv */}
            <div style={{ ...styles.apiSection, borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>
              <div style={styles.apiSectionHeader}>
                <IconDisc size={13} color="var(--accent)" />
                <span style={styles.apiSectionTitle}>Fanart.tv</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 4 }}>HD artist art &amp; banners</span>
                <a href="https://fanart.tv/get-an-api-key" target="_blank" rel="noopener" style={styles.getKeyLink}>Get free key →</a>
              </div>
              <div style={styles.apiRow}>
                <div style={{ flex: 1 }}>
                  <label style={styles.fieldLabel}>API Key</label>
                  <input type="password" placeholder="API key" style={styles.fieldInput} autoComplete="off"
                    value={settings.fanart_api_key || ''} onChange={e => setSettings(s => ({ ...s, fanart_api_key: e.target.value }))} />
                </div>
                <div style={styles.testCol}>
                  <label style={{ ...styles.fieldLabel, opacity: 0 }}>Test</label>
                  <button onClick={() => testConnection('fanart')} disabled={testing.fanart || !settings.fanart_api_key}
                    style={{ ...styles.testConnBtn, opacity: !settings.fanart_api_key ? 0.4 : 1 }}>
                    {testing.fanart ? <span style={styles.spinner} /> : <IconRefresh size={13} color="currentColor" />}
                    Test
                  </button>
                </div>
              </div>
              <TestPill result={tests.fanart} />
            </div>
          </div>

          <button onClick={saveSettings} disabled={saving || !isDirty} style={{ ...styles.saveBtn, opacity: (!isDirty || saving) ? 0.4 : 1, cursor: (!isDirty || saving) ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save Metadata Settings'}
          </button>
        </div>
      )}

      {/* Account tab */}
      {tab === 'account' && (
        <div style={styles.section}>
          <AccountTab api={api} user={user} />
        </div>
      )}

      {tab === 'analytics' && stats && (
        <div style={styles.section}>
          <AnalyticsTab analytics={stats.analytics} stats={stats} />
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setConfirmDelete(null) }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 400, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                {confirmDelete.users.length === 1 ? 'Remove user?' : `Remove ${confirmDelete.users.length} users?`}
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {confirmDelete.users.length === 1
                  ? <><strong style={{ color: 'var(--text-primary)' }}>{confirmDelete.users[0].username}</strong> will be removed from Singarr. Their requests will remain but they won't be able to log in. They can be re-imported from Plex at any time.</>
                  : <>The following users will be removed from Singarr. Their requests will remain but they won't be able to log in. They can be re-imported from Plex at any time.<br /><br />
                      <strong style={{ color: 'var(--text-primary)' }}>{confirmDelete.users.map(u => u.username).join(', ')}</strong>
                    </>
                }
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)}
                style={{ ...styles.selBtn, flex: 1, padding: '11px 0', fontSize: 13, textAlign: 'center' }}>
                Cancel
              </button>
              <button onClick={confirmDeleteUsers}
                style={{ flex: 1, padding: '11px 0', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 'var(--radius-md)', color: '#ef4444', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                {confirmDelete.users.length === 1 ? 'Remove' : `Remove ${confirmDelete.users.length} users`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plex Import Modal */}
      {plexModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setPlexModalOpen(false) }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 500, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Plex Users</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{plexImportUsers.length} users found · {selectedPlexUsers.size} selected</div>
              </div>
              <button onClick={() => setPlexModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '4px 8px' }}>✕</button>
            </div>

            {/* Toolbar */}
            <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0 }}>
              <button style={styles.selBtn} onClick={() => setSelectedPlexUsers(new Set(plexImportUsers.map(u => u.plexId)))}>Select all</button>
              <button style={styles.selBtn} onClick={() => setSelectedPlexUsers(new Set())}>Select none</button>
            </div>

            {/* User list */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '8px 16px' }}>
              {plexImportUsers.map(u => {
                const checked = selectedPlexUsers.has(u.plexId)
                return (
                  <div key={u.plexId} onClick={() => togglePlexUser(u.plexId)} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px', cursor: 'pointer',
                    borderBottom: '1px solid var(--border)', borderRadius: 8, marginBottom: 2,
                    background: checked ? 'rgba(26,122,69,0.08)' : 'transparent', transition: 'background 120ms',
                  }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                      border: `2px solid ${checked ? 'var(--accent)' : 'var(--border-strong)'}`,
                      background: checked ? 'var(--accent)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 120ms',
                    }}>
                      {checked && <IconCheck size={12} color="#fff" />}
                    </div>
                    {u.avatar
                      ? <img src={u.avatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      : <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{u.username?.[0]?.toUpperCase()}</div>
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{u.username}</div>
                      {u.email && <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: u.source === 'home' ? 'rgba(79,156,249,0.12)' : 'rgba(255,255,255,0.05)', color: u.source === 'home' ? '#4f9cf9' : 'var(--text-secondary)', flexShrink: 0 }}>{u.source}</span>
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, flexShrink: 0 }}>
              <button onClick={() => setPlexModalOpen(false)}
                style={{ ...styles.selBtn, padding: '10px 18px', fontSize: 13 }}>Cancel</button>
              <button onClick={importSelectedPlexUsers} disabled={importingPlex || selectedPlexUsers.size === 0}
                style={{ ...styles.saveBtn, flex: 1, textAlign: 'center', justifyContent: 'center', display: 'flex', opacity: (importingPlex || selectedPlexUsers.size === 0) ? 0.5 : 1 }}>
                {importingPlex ? 'Importing…' : `Import ${selectedPlexUsers.size} user${selectedPlexUsers.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NotificationsTab({ api, settings, setSettings, saveSettings, saving }) {
  const [testing, setTesting]       = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testEmail, setTestEmail]   = useState('')
  const [sending, setSending]       = useState(false)

  async function testConnection() {
    setTesting(true); setTestResult(null)
    try {
      const { data } = await api.post('/admin/test-email', {
        host: settings.email_host, port: settings.email_port,
        secure: settings.email_secure, user: settings.email_user, pass: settings.email_pass,
      })
      setTestResult(data)
    } catch { setTestResult({ ok: false, error: 'Request failed' }) }
    finally { setTesting(false) }
  }

  async function sendTest() {
    if (!testEmail) return
    setSending(true)
    try {
      const { data } = await api.post('/admin/test-email/send', {
        to: testEmail,
        host: settings.email_host,
        port: settings.email_port,
        secure: settings.email_secure,
        user: settings.email_user,
        pass: settings.email_pass,
        from: settings.email_from,
        fromName: settings.email_from_name,
      })
      if (data.ok) { toast.success('Test email sent!') }
      else { toast.error(data.error || 'Failed to send') }
    } catch { toast.error('Failed to send test email') }
    finally { setSending(false) }
  }

  const fieldInput = { ...styles.fieldInput, width: '100%' }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Enable toggle */}
      <div style={styles.card}>
        <div style={styles.toggleRow}>
          <div>
            <div style={styles.toggleLabel}>Email notifications</div>
            <div style={styles.toggleDesc}>Send emails to users when their requests are updated</div>
          </div>
          <Toggle value={settings.email_enabled === 'true'} onChange={v => setSettings(s => ({ ...s, email_enabled: String(v) }))} />
        </div>
      </div>

      {/* SMTP config */}
      <div style={styles.card}>
        <h3 style={{ ...styles.cardTitle, marginBottom:4 }}>SMTP Configuration</h3>
        <p style={styles.cardDesc}>Your outgoing mail server settings.</p>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          <div>
            <label style={styles.fieldLabel}>SMTP Host</label>
            <input type="text" placeholder="smtp.gmail.com" style={fieldInput}
              value={settings.email_host || ''} onChange={e => setSettings(s => ({ ...s, email_host: e.target.value }))} />
          </div>
          <div>
            <label style={styles.fieldLabel}>Port</label>
            <input type="number" placeholder="587" style={fieldInput}
              value={settings.email_port || '587'} onChange={e => setSettings(s => ({ ...s, email_port: e.target.value }))} />
          </div>
          <div>
            <label style={styles.fieldLabel}>Username</label>
            <input type="text" placeholder="your@email.com" style={fieldInput} autoComplete="off"
              value={settings.email_user || ''} onChange={e => setSettings(s => ({ ...s, email_user: e.target.value }))} />
          </div>
          <div>
            <label style={styles.fieldLabel}>Password / App password</label>
            <input type="password" placeholder="••••••••••••" style={fieldInput} autoComplete="off"
              value={settings.email_pass || ''} onChange={e => setSettings(s => ({ ...s, email_pass: e.target.value }))} />
          </div>
          <div>
            <label style={styles.fieldLabel}>From address</label>
            <input type="email" placeholder="singarr@yourdomain.com" style={fieldInput}
              value={settings.email_from || ''} onChange={e => setSettings(s => ({ ...s, email_from: e.target.value }))} />
          </div>
          <div>
            <label style={styles.fieldLabel}>From name</label>
            <input type="text" placeholder="Singarr" style={fieldInput}
              value={settings.email_from_name || 'Singarr'} onChange={e => setSettings(s => ({ ...s, email_from_name: e.target.value }))} />
          </div>
        </div>

        <div style={styles.toggleRow}>
          <div>
            <div style={styles.toggleLabel}>Use SSL/TLS</div>
            <div style={styles.toggleDesc}>Enable for port 465. Leave off for 587 (STARTTLS)</div>
          </div>
          <Toggle value={settings.email_secure === 'true'} onChange={v => setSettings(s => ({ ...s, email_secure: String(v), email_port: v ? '465' : '587' }))} />
        </div>

        {/* Test connection */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:16, flexWrap:'wrap' }}>
          <button onClick={testConnection} disabled={testing || !settings.email_host}
            style={{ ...styles.testConnBtn, opacity: (!settings.email_host) ? 0.4 : 1 }}>
            {testing ? <span style={styles.spinner} /> : <IconRefresh size={13} color="currentColor" />}
            Test Connection
          </button>
          {testResult && (
            <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8, background: testResult.ok ? 'rgba(26,122,69,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${testResult.ok ? 'rgba(26,122,69,0.3)' : 'rgba(239,68,68,0.3)'}`, fontSize:12, color: testResult.ok ? '#2dbe6c' : '#ef4444' }}>
              {testResult.ok ? <><IconCheck size={13} color="#2dbe6c" />Connected</> : <>✕ {testResult.error}</>}
            </div>
          )}
        </div>

        {/* Send test email */}
        <div style={{ marginTop:16, padding:'14px', background:'var(--bg-overlay)', borderRadius:10, border:'1px solid var(--border)' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-secondary)', marginBottom:8 }}>Send test email</div>
          <div style={{ display:'flex', gap:8 }}>
            <input type="email" placeholder="recipient@example.com" value={testEmail} onChange={e => setTestEmail(e.target.value)}
              style={{ flex:1, padding:'9px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border-strong)', borderRadius:7, color:'var(--text-primary)', fontSize:13, fontFamily:'var(--font-sans)', outline:'none' }} />
            <button onClick={sendTest} disabled={sending || !testEmail}
              style={{ padding:'9px 16px', background:'var(--accent-muted)', border:'1px solid var(--accent)', borderRadius:7, color:'var(--accent)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'var(--font-sans)', opacity: !testEmail ? 0.4 : 1 }}>
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>

      {/* Notification triggers */}
      <div style={styles.card}>
        <h3 style={{ ...styles.cardTitle, marginBottom:4 }}>Notification Triggers</h3>
        <p style={styles.cardDesc}>Choose which events send emails.</p>
        <div style={styles.toggleGroup}>
          {[
            { key: 'notify_request_fulfilled',   label: 'Request fulfilled',       desc: 'Email user when their music is ready in Plex' },
            { key: 'notify_request_approved',    label: 'Request approved',        desc: 'Email user when admin approves their request' },
            { key: 'notify_request_rejected',    label: 'Request rejected',        desc: 'Email user when their request is declined' },
            { key: 'notify_new_request_admin',   label: 'New request (admin)',     desc: 'Email admin when a user submits a new request' },
            { key: 'notify_new_issue_admin',     label: 'New issue (admin)',       desc: 'Email admin when a user reports an issue' },
          ].map(({ key, label, desc }) => (
            <div key={key} style={styles.toggleRow}>
              <div>
                <div style={styles.toggleLabel}>{label}</div>
                <div style={styles.toggleDesc}>{desc}</div>
              </div>
              <Toggle value={settings[key] === 'true'} onChange={v => setSettings(s => ({ ...s, [key]: String(v) }))} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding:'12px 16px', background:'rgba(79,156,249,0.07)', border:'1px solid rgba(79,156,249,0.18)', borderRadius:10, fontSize:13, color:'var(--text-secondary)' }}>
        ℹ Users must have an email address set on their Plex or local account to receive notifications. Make sure each user has an email in <strong style={{ color:'var(--text-primary)' }}>Settings → Users</strong>.
      </div>

      <button onClick={saveSettings} disabled={saving || !isDirty} style={{ ...styles.saveBtn, alignSelf:'flex-start', opacity: (!isDirty || saving) ? 0.4 : 1, cursor: (!isDirty || saving) ? 'not-allowed' : 'pointer' }}>
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  )
}

function AccountTab({ api, user }) {
  const { refreshUser } = useAuth()

  // Display name change
  const [dnValue, setDnValue]       = useState(user?.displayName || '')
  const dnOriginal                  = user?.displayName || ''
  const [dnSaving, setDnSaving]     = useState(false)
  const [dnSuccess, setDnSuccess]   = useState(false)
  const [dnError, setDnError]       = useState('')

  // Password change
  const [pwCurrent, setPwCurrent]   = useState('')
  const [pwNext, setPwNext]         = useState('')
  const [pwConfirm, setPwConfirm]   = useState('')
  const [pwSaving, setPwSaving]     = useState(false)
  const [pwSuccess, setPwSuccess]   = useState(false)
  const [pwError, setPwError]       = useState('')


  async function handleDisplayName(e) {
    e.preventDefault()
    setDnError(''); setDnSuccess(false)
    setDnSaving(true)
    try {
      await api.post('/auth/local/change-display-name', { displayName: dnValue })
      setDnSuccess(true)
      setTimeout(() => setDnSuccess(false), 4000)
      if (refreshUser) refreshUser()
    } catch (e) {
      setDnError(e.response?.data?.error || 'Failed to update display name')
    } finally { setDnSaving(false) }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault()
    setPwError('')
    if (!pwCurrent) return setPwError('Enter your current password')
    if (pwNext.length < 8) return setPwError('New password must be at least 8 characters')
    if (pwNext !== pwConfirm) return setPwError('Passwords do not match')
    setPwSaving(true)
    try {
      await api.post('/auth/local/change-password', { currentPassword: pwCurrent, newPassword: pwNext })
      setPwSuccess(true)
      setPwCurrent(''); setPwNext(''); setPwConfirm('')
      setTimeout(() => setPwSuccess(false), 4000)
    } catch (e) {
      setPwError(e.response?.data?.error || 'Failed to update password')
    } finally { setPwSaving(false) }
  }

  const score = pwNext ? [pwNext.length >= 8, /[A-Z]/.test(pwNext), /[0-9]/.test(pwNext), /[^a-zA-Z0-9]/.test(pwNext)].filter(Boolean).length : 0
  const strengthColors = ['', '#ef4444', '#e8a30f', '#4f9cf9', '#2dbe6c']
  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Profile card */}
      <div style={styles.card}>
        <h3 style={{ ...styles.cardTitle, marginBottom: 16 }}>My Account</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 0 16px', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
          {user?.avatar
            ? <img src={user.avatar} alt="" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover' }} />
            : <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#fff' }}>
                {user?.username?.[0]?.toUpperCase()}
              </div>
          }
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
              {user?.displayName || user?.username}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              {user?.isLocalAdmin ? '🔑 Local admin account' : '🎵 Plex account'}
              {user?.isAdmin && ' · Admin'}
            </div>
            {user?.displayName && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Login: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{user.username}</span>
              </div>
            )}
          </div>
        </div>

        {user?.isLocalAdmin ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

            {/* Display name */}
            <div>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Display name</h4>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                Shown in the UI instead of your login username. Leave blank to use your username.
              </p>
              {dnSuccess && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(26,122,69,0.1)', border: '1px solid rgba(26,122,69,0.3)', borderRadius: 9, marginBottom: 16, color: '#2dbe6c', fontSize: 14, fontWeight: 600 }}>
                  <IconCheck size={16} color="#2dbe6c" /> Display name updated
                </div>
              )}
              <form onSubmit={handleDisplayName}>
                <div style={styles.field}>
                  <label style={styles.fieldLabel}>Display name</label>
                  <input type="text" value={dnValue} onChange={e => { setDnValue(e.target.value); setDnError('') }}
                    placeholder={user?.username || 'e.g. Andrew'}
                    style={{ ...styles.fieldInput, width: '100%', maxWidth: 360 }}
                    autoComplete="off" maxLength={50} />
                </div>
                {dnError && (
                  <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 9, color: '#ef4444', fontSize: 13, marginBottom: 16, maxWidth: 360 }}>
                    ✕ {dnError}
                  </div>
                )}
                <button type="submit" disabled={dnSaving || dnValue.trim() === dnOriginal.trim()}
                  style={{ ...styles.saveBtn, opacity: (dnSaving || dnValue.trim() === dnOriginal.trim()) ? 0.4 : 1, cursor: (dnSaving || dnValue.trim() === dnOriginal.trim()) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {dnSaving ? <><span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />Saving…</> : 'Save display name'}
                </button>
              </form>
            </div>

            <div style={{ borderTop: '1px solid var(--border)' }} />

            {/* Change password */}
            <div>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Change password</h4>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Update the password for your local admin account.</p>

              {pwSuccess && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(26,122,69,0.1)', border: '1px solid rgba(26,122,69,0.3)', borderRadius: 9, marginBottom: 16, color: '#2dbe6c', fontSize: 14, fontWeight: 600 }}>
                  <IconCheck size={16} color="#2dbe6c" /> Password updated successfully
                </div>
              )}

              <form onSubmit={handlePasswordSubmit}>
                <div style={styles.field}>
                  <label style={styles.fieldLabel}>Current password</label>
                  <input type="password" value={pwCurrent} onChange={e => { setPwCurrent(e.target.value); setPwError('') }}
                    placeholder="Your current password"
                    style={{ ...styles.fieldInput, width: '100%', maxWidth: 360 }}
                    autoComplete="current-password" />
                </div>
                <div style={styles.field}>
                  <label style={styles.fieldLabel}>New password</label>
                  <input type="password" value={pwNext} onChange={e => { setPwNext(e.target.value); setPwError('') }}
                    placeholder="At least 8 characters"
                    style={{ ...styles.fieldInput, width: '100%', maxWidth: 360 }}
                    autoComplete="new-password" />
                  {pwNext && (
                    <div style={{ maxWidth: 360, marginTop: 6 }}>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                        {[1,2,3,4].map(i => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= score ? strengthColors[score] : 'var(--border-strong)', transition: 'background 200ms' }} />)}
                      </div>
                      <div style={{ fontSize: 11, color: strengthColors[score] }}>{strengthLabels[score]}</div>
                    </div>
                  )}
                </div>
                <div style={styles.field}>
                  <label style={styles.fieldLabel}>Confirm new password</label>
                  <input type="password" value={pwConfirm} onChange={e => { setPwConfirm(e.target.value); setPwError('') }}
                    placeholder="Re-enter new password"
                    style={{ ...styles.fieldInput, width: '100%', maxWidth: 360, borderColor: pwConfirm && pwNext && pwConfirm !== pwNext ? 'rgba(239,68,68,0.5)' : undefined }}
                    autoComplete="new-password" />
                </div>
                {pwError && (
                  <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 9, color: '#ef4444', fontSize: 13, marginBottom: 16, maxWidth: 360 }}>
                    ✕ {pwError}
                  </div>
                )}
                <button type="submit" disabled={pwSaving || !pwCurrent || !pwNext}
                  style={{ ...styles.saveBtn, opacity: (pwSaving || !pwCurrent || !pwNext) ? 0.4 : 1, cursor: (pwSaving || !pwCurrent || !pwNext) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {pwSaving ? <><span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />Updating…</> : 'Update password'}
                </button>
              </form>
            </div>

          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>
            You signed in with Plex. Password management is handled through your Plex account at <a href="https://www.plex.tv" target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>plex.tv</a>.
          </div>
        )}
      </div>
    </div>
  )
}


function TestPill({ result }) {
  if (!result) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '7px 12px', borderRadius: 8, marginTop: 8,
      background: result.ok ? 'rgba(26,122,69,0.08)' : 'rgba(239,68,68,0.08)',
      border: `1px solid ${result.ok ? 'rgba(26,122,69,0.25)' : 'rgba(239,68,68,0.25)'}`,
      fontSize: 12,
      color: result.ok ? 'var(--status-downloaded)' : 'var(--status-rejected)',
    }}>
      {result.ok
        ? <><IconCheck size={13} color="var(--status-downloaded)" />{result.message || 'Connected'}</>
        : <>✕ {result.error || 'Connection failed'}</>
      }
    </div>
  )
}

function Toggle({ value, onChange, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
      {label && <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{label}</span>}
      <button
        onClick={() => onChange(!value)}
        style={{
          width: '40px', height: '22px',
          borderRadius: '999px',
          border: value ? 'none' : '1px solid rgba(255,255,255,0.15)',
          background: value ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
          cursor: 'pointer', position: 'relative',
          transition: 'background var(--transition)',
          flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute', top: value ? '3px' : '2px',
          left: value ? '21px' : '3px',
          width: '16px', height: '16px',
          borderRadius: '50%',
          background: value ? '#fff' : 'rgba(255,255,255,0.5)',
          transition: 'left var(--transition)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
        }} />
      </button>
    </div>
  )
}

function AnalyticsTab({ analytics, stats }) {
  if (!analytics) return <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No data yet.</div>

  const { requestsByDay, requestsByType, requestsByStatus, topRequesters, topArtists, avgPerDay } = analytics

  // Build last 30 days chart data — fill in missing days with 0
  const days = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const key = d.toISOString().substring(0, 10)
    const found = requestsByDay.find(r => r.day === key)
    days.push({ day: key, count: found?.count || 0, label: formatDateShort(d) })
  }
  const maxCount = Math.max(...days.map(d => d.count), 1)

  const statusColors = { pending: '#e8a30f', approved: '#4f9cf9', found: '#a78bfa', downloading: '#f97316', downloaded: '#2dbe6c', rejected: '#ef4444' }
  const typeColors = { album: '#2dbe6c', artist: '#4f9cf9', track: '#e8a30f' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {[
          { label: 'Total Requests', value: stats.totalRequests },
          { label: 'Downloaded', value: stats.downloadedRequests },
          { label: 'Pending', value: stats.pendingRequests },
          { label: 'Avg / Day', value: avgPerDay },
        ].map(c => (
          <div key={c.label} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)' }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Requests over 30 days bar chart */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>Requests — last 30 days</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
          {days.map((d, i) => (
            <div key={i} title={`${d.label}: ${d.count}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ width: '100%', borderRadius: 3, background: d.count > 0 ? 'var(--accent)' : 'var(--bg-overlay)', height: `${Math.max(4, (d.count / maxCount) * 100)}%`, transition: 'height 300ms', minHeight: d.count > 0 ? 6 : 3 }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{days[0]?.label}</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{days[days.length - 1]?.label}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* By type */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>By type</div>
          {requestsByType.map(r => (
            <div key={r.type} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: 999, background: typeColors[r.type] || 'var(--accent)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1, textTransform: 'capitalize' }}>{r.type}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{r.count}</span>
              <div style={{ width: 60, height: 4, borderRadius: 2, background: 'var(--bg-overlay)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 2, background: typeColors[r.type] || 'var(--accent)', width: `${(r.count / stats.totalRequests) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* By status */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>By status</div>
          {requestsByStatus.map(r => (
            <div key={r.status} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: 999, background: statusColors[r.status] || 'var(--accent)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1, textTransform: 'capitalize' }}>{r.status}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{r.count}</span>
              <div style={{ width: 60, height: 4, borderRadius: 2, background: 'var(--bg-overlay)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 2, background: statusColors[r.status] || 'var(--accent)', width: `${(r.count / stats.totalRequests) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Top requesters */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Top requesters</div>
          {topRequesters.length === 0
            ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No data yet</div>
            : topRequesters.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 16, textAlign: 'right', flexShrink: 0 }}>#{i + 1}</span>
                {r.avatar
                  ? <img src={r.avatar} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  : <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{r.username?.[0]?.toUpperCase()}</div>
                }
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>{r.username}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{r.count}</span>
              </div>
            ))
          }
        </div>

        {/* Top artists */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Most requested artists</div>
          {topArtists.length === 0
            ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No data yet</div>
            : topArtists.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 16, textAlign: 'right', flexShrink: 0 }}>#{i + 1}</span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.artist_name}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{r.count}</span>
              </div>
            ))
          }
        </div>

      </div>
    </div>
  )
}

const styles = {
  root: { padding: '24px', maxWidth: '900px', margin: '0 auto' },
  header: { marginBottom: '24px' },
  pageTitle: { fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' },
  pageSubtitle: { fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' },
  tabBar: {
    display: 'flex', borderBottom: '1px solid var(--border)',
    marginBottom: '24px', gap: '0',
  },
  tabBtn: {
    padding: '10px 20px',
    background: 'none', border: 'none',
    fontSize: '14px', fontWeight: '600',
    fontFamily: 'var(--font-sans)', cursor: 'pointer',
    transition: 'var(--transition)',
  },
  section: { display: 'flex', flexDirection: 'column', gap: '16px' },
  statsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '12px', marginBottom: '4px',
  },
  statCard: {
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '20px 16px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
    transition: 'border-color var(--transition)',
  },
  statIconWrap: {
    width: '40px', height: '40px',
    background: 'var(--accent-muted)',
    borderRadius: 'var(--radius-sm)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: '4px',
  },
  statValue: { fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' },
  statLabel: { fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' },
  card: {
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)', padding: '24px',
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  cardTitle: { fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' },
  cardDesc: { fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' },
  actionBtn: {
    padding: '6px 14px',
    background: 'var(--accent-muted)', border: '1px solid var(--accent)',
    borderRadius: 'var(--radius-md)', color: 'var(--accent)',
    fontSize: '12px', fontWeight: '700',
    fontFamily: 'var(--font-sans)', cursor: 'pointer',
    transition: 'var(--transition)',
    display: 'flex', alignItems: 'center', gap: '6px',
  },
  toggleGroup: { display: 'flex', flexDirection: 'column', gap: '0' },
  toggleRow: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', padding: '14px 0',
    borderBottom: '1px solid var(--border)',
  },
  toggleLabel: { fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)' },
  toggleDesc: { fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' },
  fieldGroup: { display: 'flex', gap: '16px', flexWrap: 'wrap' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  fieldLabel: { fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: 4 },
  fieldInput: {
    padding: '8px 12px', width: '100%',
    background: 'var(--bg-overlay)', border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
    fontSize: '13px', fontFamily: 'var(--font-sans)',
    outline: 'none',
  },
  apiSection: {
    paddingBottom: 16, marginBottom: 16,
    borderBottom: '1px solid var(--border)',
  },
  apiSectionHeader: {
    display: 'flex', alignItems: 'center', gap: 8,
    marginBottom: 12,
  },
  apiSectionTitle: {
    fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
  },
  apiRow: {
    display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap',
  },
  testCol: {
    flexShrink: 0, display: 'flex', flexDirection: 'column',
  },
  testConnBtn: {
    padding: '8px 14px',
    background: 'var(--accent-muted)', border: '1px solid var(--accent)',
    borderRadius: 'var(--radius-sm)', color: 'var(--accent)',
    fontSize: '12px', fontWeight: '700',
    fontFamily: 'var(--font-sans)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 6,
    whiteSpace: 'nowrap', transition: 'var(--transition)',
  },
  getKeyLink: {
    marginLeft: 'auto', fontSize: 12, fontWeight: 600,
    color: 'var(--accent)', textDecoration: 'none',
  },
  spinner: {
    width: 13, height: 13,
    border: '2px solid rgba(255,255,255,0.2)',
    borderTopColor: 'currentColor',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
    display: 'inline-block',
  },
  selBtn: {
    padding: '4px 10px', background: 'none',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
    color: 'var(--text-secondary)', fontSize: 11,
    fontFamily: 'var(--font-sans)', cursor: 'pointer',
  },
  saveBtn: {
    padding: '12px 28px',
    background: 'var(--accent)', border: 'none',
    borderRadius: 'var(--radius-md)', color: '#fff',
    fontSize: '14px', fontWeight: '700',
    fontFamily: 'var(--font-sans)', cursor: 'pointer',
    alignSelf: 'flex-start', transition: 'var(--transition)',
  },
  userRow: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '12px 0', borderBottom: '1px solid var(--border)',
  },
  userAvatarWrap: { flexShrink: 0 },
  userAvatar: { width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' },
  userAvatarFallback: {
    width: '40px', height: '40px', borderRadius: '50%',
    background: 'var(--accent)', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '16px', fontWeight: '700',
  },
  userInfo: { flex: 1, minWidth: 0 },
  userName: { fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' },
  userMeta: { fontSize: '12px', color: 'var(--text-muted)' },
  userActions: { display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, flexWrap: 'wrap' },
  select: {
    padding: '5px 8px',
    background: 'var(--bg-overlay)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
    fontSize: '12px', fontFamily: 'var(--font-sans)',
    cursor: 'pointer', outline: 'none',
  },
  miniRow: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '8px 0', borderBottom: '1px solid var(--border)',
  },
  miniType: {
    fontSize: '10px', fontWeight: '700', color: 'var(--accent)',
    textTransform: 'uppercase', letterSpacing: '0.05em', width: '40px', flexShrink: 0,
  },
  miniTitle: { flex: 1, fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  miniUser: { fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 },
}
