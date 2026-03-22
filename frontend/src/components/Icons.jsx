export function IconMusicNote({ size = 16, color = 'currentColor', style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} xmlns="http://www.w3.org/2000/svg">
      <path d="M9 18V6l12-2v12" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="6" cy="18" r="3" stroke={color} strokeWidth="2"/>
      <circle cx="18" cy="16" r="3" stroke={color} strokeWidth="2"/>
    </svg>
  )
}

export function IconDisc({ size = 16, color = 'currentColor', style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.8"/>
      <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.8"/>
      <circle cx="12" cy="12" r="1" fill={color}/>
      <path d="M12 2a10 10 0 0 1 7.07 2.93" stroke={color} strokeWidth="1.8" strokeLinecap="round" opacity="0.4"/>
      <path d="M12 22a10 10 0 0 1-7.07-2.93" stroke={color} strokeWidth="1.8" strokeLinecap="round" opacity="0.4"/>
    </svg>
  )
}

export function IconMicrophone({ size = 16, color = 'currentColor', style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} xmlns="http://www.w3.org/2000/svg">
      <rect x="9" y="2" width="6" height="11" rx="3" stroke={color} strokeWidth="1.8"/>
      <path d="M5 10a7 7 0 0 0 14 0" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M12 17v5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M8 22h8" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

export function IconVinyl({ size = 16, color = 'currentColor', style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.8"/>
      <circle cx="12" cy="12" r="6" stroke={color} strokeWidth="1.8" opacity="0.45"/>
      <circle cx="12" cy="12" r="2.5" stroke={color} strokeWidth="1.8"/>
      <circle cx="12" cy="12" r="1" fill={color}/>
    </svg>
  )
}

export function IconHeadphones({ size = 16, color = 'currentColor', style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} xmlns="http://www.w3.org/2000/svg">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <rect x="2" y="15" width="4" height="6" rx="2" stroke={color} strokeWidth="1.8"/>
      <rect x="18" y="15" width="4" height="6" rx="2" stroke={color} strokeWidth="1.8"/>
    </svg>
  )
}

export function IconSearch({ size = 16, color = 'currentColor', style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} xmlns="http://www.w3.org/2000/svg">
      <circle cx="10.5" cy="10.5" r="7.5" stroke={color} strokeWidth="1.8"/>
      <path d="M16 16l4.5 4.5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

export function IconDownload({ size = 16, color = 'currentColor', style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

export function IconPlus({ size = 16, color = 'currentColor', style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} xmlns="http://www.w3.org/2000/svg">
      <path d="M12 5v14M5 12h14" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

export function IconSettings({ size = 16, color = 'currentColor', style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.8"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

export function IconLogout({ size = 16, color = 'currentColor', style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} xmlns="http://www.w3.org/2000/svg">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <polyline points="16 17 21 12 16 7" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="21" y1="12" x2="9" y2="12" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

export function IconRefresh({ size = 16, color = 'currentColor', style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} xmlns="http://www.w3.org/2000/svg">
      <path d="M23 4v6h-6" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M1 20v-6h6" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function IconTrash({ size = 16, color = 'currentColor', style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} xmlns="http://www.w3.org/2000/svg">
      <polyline points="3 6 5 6 21 6" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19 6l-1 14H6L5 6" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10 11v6M14 11v6" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M9 6V4h6v2" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function TypeIcon({ type, size = 16, color = 'currentColor', style = {} }) {
  if (type === 'artist') return <IconMicrophone size={size} color={color} style={style} />
  if (type === 'album')  return <IconDisc       size={size} color={color} style={style} />
  if (type === 'track')  return <IconMusicNote  size={size} color={color} style={style} />
  return <IconHeadphones size={size} color={color} style={style} />
}

export function IconCheck({ size = 16, color = 'currentColor', style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} xmlns="http://www.w3.org/2000/svg">
      <path d="M20 6L9 17l-5-5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function IconKey({ size = 16, color = 'currentColor', style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="15" r="5" stroke={color} strokeWidth="1.8"/>
      <path d="M13 12l7-7" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M18 7l2 2" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M16 9l2 2" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

export function IconIssue({ size = 16, color = 'currentColor', style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.8"/>
      <path d="M12 8v4" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="12" cy="16" r="1" fill={color}/>
    </svg>
  )
}
