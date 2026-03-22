const STATUS_CONFIG = {
  pending:     { label: 'Pending',     emoji: '⏳', bg: 'rgba(232,163,15,0.12)' },
  approved:    { label: 'Approved',    emoji: '✓',  bg: 'rgba(79,156,249,0.12)' },
  found:       { label: 'Found',       emoji: '◉',  bg: 'rgba(155,123,255,0.12)' },
  downloading: { label: 'Downloading', emoji: '↓',  bg: 'rgba(232,73,15,0.12)' },
  downloaded:  { label: 'Downloaded',  emoji: '✔',  bg: 'rgba(34,197,94,0.12)' },
  rejected:    { label: 'Rejected',    emoji: '✕',  bg: 'rgba(239,68,68,0.12)' },
  unavailable: { label: 'Unavailable', emoji: '—',  bg: 'rgba(107,114,128,0.12)' },
}

export default function StatusBadge({ status, size = 'md' }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  const isSmall = size === 'sm'

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: isSmall ? '2px 8px' : '4px 10px',
      borderRadius: '999px',
      background: cfg.bg,
      fontSize: isSmall ? '11px' : '12px',
      fontWeight: '600',
      fontFamily: 'var(--font-sans)',
      letterSpacing: '0.02em',
    }} className={`status-${status}`}>
      <span style={{ fontSize: isSmall ? '10px' : '11px' }}>{cfg.emoji}</span>
      {cfg.label}
    </span>
  )
}
