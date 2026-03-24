const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

export function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', {
    timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric',
  })
}

export function formatDateTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })
}

export function formatDateShort(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', {
    timeZone: TZ, month: 'short', day: 'numeric',
  })
}
