import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'

function Bar({ label, used, limit, days }) {
  if (limit === Infinity || limit === 0) {
    return (
      <div style={styles.barWrap}>
        <div style={styles.row}>
          <span style={styles.label}>{label}</span>
          <span style={{ ...styles.count, color: 'var(--text-muted)' }}>{used} / ∞</span>
        </div>
      </div>
    )
  }
  const pct = Math.min(100, (used / limit) * 100)
  const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#e8a30f' : 'var(--accent)'
  return (
    <div style={styles.barWrap}>
      <div style={styles.row}>
        <span style={styles.label}>{label}</span>
        <span style={styles.count}>{used} / {limit}</span>
      </div>
      <div style={styles.track}>
        <div style={{ ...styles.fill, width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

export default function LimitBar() {
  const { api, user } = useAuth()
  const [limits, setLimits] = useState(null)

  useEffect(() => {
    api.get('/requests/limits').then(r => setLimits(r.data)).catch(() => {})
  }, [])

  if (!limits || user?.isAdmin) return null

  return (
    <div style={styles.wrap}>
      <Bar label="Albums" used={limits.album?.used ?? 0} limit={limits.album?.limit ?? 0} />
      <Bar label="Tracks" used={limits.track?.used ?? 0} limit={limits.track?.limit ?? 0} />
      <div style={styles.hint}>Resets every {limits.album?.days ?? 7} days</div>
    </div>
  )
}

const styles = {
  wrap: {
    padding: '12px 16px',
    background: 'var(--bg-overlay)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  barWrap: {},
  row: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 4,
  },
  label: { fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '500' },
  count: { fontSize: '12px', color: 'var(--text-primary)', fontWeight: '600', fontFamily: 'var(--font-mono)' },
  track: {
    height: '4px', background: 'var(--border-strong)',
    borderRadius: '2px', overflow: 'hidden',
  },
  fill: {
    height: '100%', borderRadius: '2px',
    transition: 'width 600ms cubic-bezier(0.4,0,0.2,1)',
  },
  hint: { fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 },
}
