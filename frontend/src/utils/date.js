const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

function toUTC(dateStr) {
  if (!dateStr) return null
  // SQLite stores without timezone — append Z so browser parses as UTC
  const s = String(dateStr)
  return new Date(s.includes('Z') || s.includes('+') ? s : s.replace(' ', 'T') + 'Z')
}

export function formatDate(dateStr) {
  const d = toUTC(dateStr)
  if (!d) return ''
  return d.toLocaleDateString('en-US', {
    timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric',
  })
}

export function formatDateTime(dateStr) {
  const d = toUTC(dateStr)
  if (!d) return ''
  return d.toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })
}

export function formatDateShort(dateStr) {
  const d = toUTC(dateStr)
  if (!d) return ''
  return d.toLocaleDateString('en-US', {
    timeZone: TZ, month: 'short', day: 'numeric',
  })
}
