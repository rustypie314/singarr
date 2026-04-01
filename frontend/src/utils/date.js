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

// Route external cover art URLs through the backend proxy to avoid CORS issues
export function proxyCover(url) {
  if (!url) return null
  if (url.startsWith('/api/')) return url // already a proxy URL
  // Ensure https
  const safeUrl = url.replace(/^http:\/\//, 'https://')
  return `/api/plex/cover?url=${encodeURIComponent(safeUrl)}`
}

// Quality badge label and colors
export function qualityBadge(quality) {
  const map = {
    '24bit-flac': { label: '24-bit FLAC', bg: 'rgba(24,95,165,0.85)',   color: '#B5D4F4' },
    '16bit-flac': { label: '16-bit FLAC', bg: 'rgba(15,110,86,0.85)',   color: '#9FE1CB' },
    'flac':       { label: 'FLAC',        bg: 'rgba(26,122,69,0.85)',   color: '#9FE1CB' },
    'wav':        { label: 'WAV',         bg: 'rgba(120,80,180,0.85)',  color: '#D4B5F4' },
    'mp3-320':    { label: 'MP3 320',     bg: 'rgba(80,110,145,0.85)',  color: '#C8DDF0' },
    'mp3-256':    { label: 'MP3 256',     bg: 'rgba(60,88,118,0.85)',   color: '#B8CEEA' },
    'mp3-192':    { label: 'MP3 192',     bg: 'rgba(45,68,95,0.85)',    color: '#A8BEE0' },
    'mp3-128':    { label: 'MP3 128',     bg: 'rgba(32,50,72,0.85)',    color: '#94AECE' },
    'mp3':        { label: 'MP3',         bg: 'rgba(25,40,58,0.85)',    color: '#8098BC' },
    'aac':        { label: 'AAC',         bg: 'rgba(180,80,20,0.85)',   color: '#F4B07A' },
    'ogg':        { label: 'OGG',         bg: 'rgba(60,100,60,0.85)',   color: '#A0D4A0' },
  }
  return map[quality] || null
}
