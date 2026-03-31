import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useTheme } from '../contexts/ThemeContext.jsx'
import { IconHeadphones, IconVinyl, IconSettings, IconLogout, IconMusicNote, IconIssue } from './Icons.jsx'

export default function Layout() {
  const { user, logout, api } = useAuth()
  const { theme, toggle } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [openIssues, setOpenIssues] = useState(0)
  const location = useLocation()

  // Fetch badge counts
  useEffect(() => {
    fetchCounts()
    const interval = setInterval(fetchCounts, 60000)
    return () => clearInterval(interval)
  }, [])

  // Refresh counts on nav
  useEffect(() => { fetchCounts() }, [location.pathname])

  async function fetchCounts() {
    try {
      const [reqRes, issueRes] = await Promise.allSettled([
        api.get('/requests/all'),
        api.get('/issues/counts'),
      ])
      if (reqRes.status === 'fulfilled') {
        const reqs = reqRes.value.data.requests || []
        setPendingCount(reqs.filter(r => r.status === 'pending').length)
      }
      if (issueRes.status === 'fulfilled') {
        setOpenIssues(issueRes.value.data.open || 0)
      }
    } catch {}
  }

  function closeSidebar() { setSidebarOpen(false) }

  const NAV = [
    { to: '/',         label: 'Discover', Icon: IconHeadphones, count: 0 },
    { to: '/requests', label: 'Requests', Icon: IconVinyl,       count: pendingCount },
    { to: '/issues',   label: 'Issues',   Icon: IconIssue,       count: openIssues },
  ]

  return (
    <div style={styles.root}>
      {/* Mobile top bar */}
      <div className="mobile-topbar" style={styles.topbar}>
        <button style={styles.hamburger} onClick={() => setSidebarOpen(o => !o)}>
          <div style={styles.hamLine} />
          <div style={styles.hamLine} />
          <div style={styles.hamLine} />
        </button>
        <div style={styles.topbarLogo}>
          <div style={styles.logoMarkSm}><IconMusicNote size={14} color="#fff" /></div>
          <span style={styles.topbarName}>Singarr</span>
        </div>
        <button onClick={toggle} style={styles.topbarTheme}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>

      {/* Overlay */}
      <div className={`sidebar-overlay${sidebarOpen ? ' active' : ''}`} onClick={closeSidebar} />

      {/* Sidebar */}
      <aside className={`mobile-sidebar${sidebarOpen ? ' open' : ''}`} style={styles.sidebar}>
        <div style={styles.logoRow}>
          <div style={styles.logoMark}><IconMusicNote size={17} color="#fff" /></div>
          <span style={styles.logoText}>Singarr</span>
        </div>

        <nav style={styles.nav}>
          {NAV.map(({ to, label, Icon, count }) => (
            <NavLink key={to} to={to} end={to === '/'}
              onClick={closeSidebar}
              style={({ isActive }) => ({
                ...styles.navItem,
                background: isActive ? 'var(--accent-muted)' : 'transparent',
                color: isActive ? 'var(--accent-bright)' : 'var(--text-secondary)',
                borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
              })}
            >
              <Icon size={16} color="currentColor" />
              <span style={{ flex: 1 }}>{label}</span>
              {count > 0 && (
                <span style={styles.badge}>{count}</span>
              )}
            </NavLink>
          ))}

          {user?.isAdmin && (
            <NavLink to="/admin" onClick={closeSidebar}
              style={({ isActive }) => ({
                ...styles.navItem,
                background: isActive ? 'var(--accent-muted)' : 'transparent',
                color: isActive ? 'var(--accent-bright)' : 'var(--text-secondary)',
                borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
              })}
            >
              <IconSettings size={16} color="currentColor" />
              <span style={{ flex: 1 }}>Settings</span>
            </NavLink>
          )}
        </nav>

        <div style={styles.sidebarBottom}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <button onClick={toggle} style={{ ...styles.themeBtn }} className="hide-mobile">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.02em' }}>v{__APP_VERSION__}</span>
          </div>
          <div style={styles.userCard}>
            <div style={styles.userRow}>
              {user?.avatar
                ? <img src={user.avatar} alt="" style={styles.avatar} />
                : <div style={styles.avatarFallback}>{(user?.displayName || user?.username)?.[0]?.toUpperCase()}</div>
              }
              <div style={styles.userInfo}>
                <div style={styles.userName}>{user?.displayName || user?.username}</div>
                <div style={styles.userRole}>{user?.isAdmin ? 'Admin' : 'Member'}</div>
              </div>
              <button onClick={logout} style={styles.logoutBtn} title="Sign out">
                <IconLogout size={15} color="currentColor" />
              </button>
            </div>

          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={styles.main}>
        {user && !user.isAdmin && !user.isApproved && (
          <div style={{ background: 'rgba(232,163,15,0.08)', borderBottom: '1px solid rgba(232,163,15,0.2)', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 9, fontSize: 13 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#e8a30f', flexShrink: 0, animation: 'pulse 2s infinite' }} />
            <span style={{ color: '#f0f0f2', fontWeight: 600 }}>Account pending approval</span>
            <span style={{ color: '#e8a30f' }}>— Your account is read-only.</span>
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            className="page-content"
            style={styles.pageContent}
          >
            <Outlet context={{ refreshCounts: fetchCounts }} />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}

const styles = {
  root: { display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' },
  topbar: { position: 'fixed', top: 0, left: 0, right: 0, height: 56, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', zIndex: 30, gap: 12 },
  hamburger: { background: 'none', border: 'none', cursor: 'pointer', padding: 8, display: 'flex', flexDirection: 'column', gap: 5 },
  hamLine: { width: 22, height: 2, background: 'var(--text-secondary)', borderRadius: 2 },
  topbarLogo: { display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' },
  logoMarkSm: { width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#1a7a45,#2dbe6c)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  topbarName: { fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.3px' },
  topbarTheme: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', padding: 4 },
  sidebar: { width: 220, minHeight: '100vh', background: 'var(--bg-surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '24px 0', flexShrink: 0 },
  logoRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px 22px' },
  logoMark: { width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#1a7a45,#2dbe6c)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(26,122,69,0.35)', flexShrink: 0 },
  logoText: { fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.3px' },
  nav: { display: 'flex', flexDirection: 'column', gap: 2, padding: '0 10px', flex: 1 },
  navItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 'var(--radius-sm)', fontSize: 15, fontWeight: 500, fontFamily: 'var(--font-sans)', textDecoration: 'none', transition: 'var(--transition)', cursor: 'pointer' },
  badge: { minWidth: 20, height: 20, padding: '0 6px', background: 'var(--accent)', color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)' },
  sidebarBottom: { padding: '14px 14px 0', borderTop: '1px solid var(--border)', marginTop: 8 },
  themeBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: '4px 2px', color: 'var(--text-secondary)', marginBottom: 12 },
  userCard: { background: 'var(--bg-overlay)', borderRadius: 'var(--radius-md)', padding: '10px 12px' },
  userRow: { display: 'flex', alignItems: 'center', gap: 9 },
  avatar: { width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
  avatarFallback: { width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 },
  userInfo: { flex: 1, minWidth: 0 },
  userName: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  userRole: { fontSize: 11, color: 'var(--text-muted)' },
  logoutBtn: { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: 6, flexShrink: 0 },
  changePwBtn: { display: 'block', width: '100%', marginTop: 8, padding: '7px 10px', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'var(--font-sans)', cursor: 'pointer', textAlign: 'left', textDecoration: 'none' },
  main: { flex: 1, overflow: 'auto', background: 'var(--bg-base)' },
  pageContent: { minHeight: '100%', padding: '32px' },
}
