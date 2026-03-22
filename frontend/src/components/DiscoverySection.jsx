import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext.jsx'
import StatusBadge from './StatusBadge.jsx'
import RequestModal from './RequestModal.jsx'
import toast from 'react-hot-toast'

const SECTION_GENRES = [
  'All', 'Rock', 'Pop', 'Hip-Hop', 'Electronic', 'Indie',
  'R&B', 'Metal', 'Jazz', 'Classical', 'Country', 'Folk',
  'Alternative', 'Soul', 'Punk', 'Dance', 'Ambient',
]

export default function DiscoverySection({ title, endpoint, icon, userGenres = [], onRequestSuccess }) {
  const { api } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeGenre, setActiveGenre] = useState('All')
  const [selected, setSelected] = useState(null)
  const [selectedType, setSelectedType] = useState(null)
  const scrollRef = useRef(null)
  const genreScrollRef = useRef(null)

  // Default to first user genre if set
  useEffect(() => {
    if (userGenres.length > 0 && activeGenre === 'All') {
      // keep All as default so user sees broad results first
    }
  }, [userGenres])

  useEffect(() => {
    fetchData(activeGenre)
  }, [activeGenre])

  async function fetchData(genre) {
    setLoading(true)
    try {
      const params = genre !== 'All' ? { genre: genre.toLowerCase() } : {}
      const res = await api.get(endpoint, { params })
      setItems(res.data.results || [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  function scrollRow(dir) {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir * 300, behavior: 'smooth' })
    }
  }

  function handleCardClick(item) {
    if (item.inPlex) return toast('Already in your Plex library', { icon: '📚' })
    if (item.requestStatus) return toast(`Already ${item.requestStatus}`, { icon: '♪' })
    const type = item.type || 'album'
    setSelectedType(type)
    setSelected(item)
  }

  // Build genre pill list — put user's genres first
  const genreList = ['All', ...userGenres, ...SECTION_GENRES.filter(g => g !== 'All' && !userGenres.includes(g))]
  const uniqueGenres = [...new Set(genreList)]

  return (
    <div style={styles.section}>
      {/* Section header */}
      <div style={styles.sectionHeader}>
        <div style={styles.sectionTitle}>
          <span style={styles.sectionIcon}>{icon}</span>
          <h2 style={styles.sectionName}>{title}</h2>
        </div>
        <div style={styles.scrollBtns}>
          <button onClick={() => scrollRow(-1)} style={styles.scrollBtn}>‹</button>
          <button onClick={() => scrollRow(1)} style={styles.scrollBtn}>›</button>
        </div>
      </div>

      {/* Genre filter pills */}
      <div ref={genreScrollRef} style={styles.genrePills}>
        {uniqueGenres.map(genre => (
          <motion.button
            key={genre}
            whileTap={{ scale: 0.95 }}
            onClick={() => setActiveGenre(genre)}
            style={{
              ...styles.pill,
              background: activeGenre === genre ? 'var(--accent)' : 'var(--bg-elevated)',
              color: activeGenre === genre ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${activeGenre === genre ? 'var(--accent)' : 'var(--border)'}`,
              fontWeight: activeGenre === genre ? '700' : '500',
            }}
          >
            {genre}
            {userGenres.includes(genre) && genre !== 'All' && (
              <span style={styles.pillDot} />
            )}
          </motion.button>
        ))}
      </div>

      {/* Cards row */}
      <div ref={scrollRef} style={styles.cardsRow}>
        {loading
          ? [...Array(8)].map((_, i) => <SkeletonCard key={i} />)
          : items.length === 0
            ? <div style={styles.emptyRow}>Nothing found for this genre yet</div>
            : items.map((item, i) => (
                <DiscoveryCard
                  key={item.id || i}
                  item={item}
                  index={i}
                  onClick={() => handleCardClick(item)}
                />
              ))
        }
      </div>

      {selected && (
        <RequestModal
          item={selected}
          type={selectedType}
          onClose={() => { setSelected(null); setSelectedType(null) }}
          onSuccess={() => {
            onRequestSuccess?.()
            fetchData(activeGenre)
          }}
        />
      )}
    </div>
  )
}

function DiscoveryCard({ item, index, onClick }) {
  const [hovered, setHovered] = useState(false)
  const title = item.type === 'artist' ? item.name : item.title
  const art = item.coverUrl || item.thumbUrl
  const isBlocked = item.inPlex || item.requestStatus

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        ...styles.card,
        cursor: isBlocked ? 'default' : 'pointer',
        opacity: isBlocked ? 0.6 : 1,
        transform: hovered && !isBlocked ? 'translateY(-6px)' : 'translateY(0)',
        boxShadow: hovered && !isBlocked ? '0 12px 32px rgba(0,0,0,0.3)' : 'none',
        transition: 'transform 200ms ease, box-shadow 200ms ease, opacity 200ms ease',
      }}
    >
      {/* Art */}
      <div style={{
        ...styles.cardArt,
        borderRadius: item.type === 'artist' ? '50%' : 'var(--radius-md)',
      }}>
        {art
          ? <img
              src={art}
              alt={title}
              style={{
                ...styles.cardImg,
                borderRadius: item.type === 'artist' ? '50%' : 'var(--radius-md)',
              }}
              loading="lazy"
            />
          : <div style={{
              ...styles.cardArtFallback,
              borderRadius: item.type === 'artist' ? '50%' : 'var(--radius-md)',
            }}>
              {item.type === 'artist' ? '♪' : item.type === 'track' ? '♫' : '◉'}
            </div>
        }

        {/* Hover overlay */}
        {hovered && !isBlocked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              ...styles.hoverOverlay,
              borderRadius: item.type === 'artist' ? '50%' : 'var(--radius-md)',
            }}
          >
            <div style={styles.plusIcon}>+</div>
          </motion.div>
        )}

        {/* Plex badge */}
        {item.inPlex && (
          <div style={styles.plexBadge}>In Plex</div>
        )}
      </div>

      {/* Info */}
      <div style={styles.cardInfo}>
        <div style={styles.cardTitle}>{title}</div>
        {item.type !== 'artist' && item.artistName && (
          <div style={styles.cardSub}>{item.artistName}</div>
        )}
        {item.year && <div style={styles.cardMeta}>{item.year}</div>}
        {item.requestStatus && (
          <div style={{ marginTop: '5px' }}>
            <StatusBadge status={item.requestStatus} size="sm" />
          </div>
        )}
      </div>
    </motion.div>
  )
}

function SkeletonCard() {
  return (
    <div style={styles.card}>
      <div className="skeleton" style={{ width: '100%', aspectRatio: '1', borderRadius: 'var(--radius-md)', marginBottom: '10px' }} />
      <div className="skeleton" style={{ height: '13px', width: '80%', marginBottom: '6px', borderRadius: '4px' }} />
      <div className="skeleton" style={{ height: '11px', width: '55%', borderRadius: '4px' }} />
    </div>
  )
}

const styles = {
  section: { marginBottom: '40px' },
  sectionHeader: {
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  sectionTitle: { display: 'flex', alignItems: 'center', gap: '10px' },
  sectionIcon: { fontSize: '20px' },
  sectionName: {
    fontSize: '18px', fontWeight: '800',
    color: 'var(--text-primary)', letterSpacing: '-0.3px',
  },
  scrollBtns: { display: 'flex', gap: '6px' },
  scrollBtn: {
    width: '30px', height: '30px',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: '50%', color: 'var(--text-secondary)',
    fontSize: '18px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'var(--transition)', lineHeight: 1,
  },
  genrePills: {
    display: 'flex', gap: '6px',
    overflowX: 'auto', paddingBottom: '10px',
    marginBottom: '8px',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  },
  pill: {
    padding: '5px 14px', flexShrink: 0,
    borderRadius: '999px', fontSize: '12px',
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer', transition: 'all 150ms ease',
    display: 'flex', alignItems: 'center', gap: '5px',
    whiteSpace: 'nowrap',
  },
  pillDot: {
    width: '5px', height: '5px',
    borderRadius: '50%', background: 'currentColor',
    opacity: 0.7,
  },
  cardsRow: {
    display: 'flex', gap: '14px',
    overflowX: 'auto', paddingBottom: '8px',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    scrollSnapType: 'x mandatory',
  },
  emptyRow: {
    color: 'var(--text-muted)', fontSize: '14px',
    padding: '20px 0',
  },
  card: {
    flexShrink: 0, width: '148px',
    scrollSnapAlign: 'start',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
  },
  cardArt: {
    width: '100%', aspectRatio: '1',
    background: 'var(--bg-overlay)',
    position: 'relative', overflow: 'hidden',
  },
  cardImg: {
    width: '100%', height: '100%',
    objectFit: 'cover', display: 'block',
  },
  cardArtFallback: {
    width: '100%', height: '100%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '36px', color: 'var(--text-muted)',
  },
  hoverOverlay: {
    position: 'absolute', inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  plusIcon: {
    width: '40px', height: '40px',
    background: 'var(--accent)',
    borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '24px', color: '#fff', fontWeight: '300',
    boxShadow: '0 4px 16px var(--accent-glow)',
  },
  plexBadge: {
    position: 'absolute', bottom: '6px', right: '6px',
    padding: '2px 7px',
    background: 'rgba(229,160,13,0.92)',
    color: '#000', fontSize: '9px', fontWeight: '700',
    borderRadius: '999px',
  },
  cardInfo: { padding: '10px' },
  cardTitle: {
    fontSize: '12px', fontWeight: '600',
    color: 'var(--text-primary)', lineHeight: 1.3,
    overflow: 'hidden', textOverflow: 'ellipsis',
    display: '-webkit-box', WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    marginBottom: '2px',
  },
  cardSub: {
    fontSize: '11px', color: 'var(--text-secondary)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  cardMeta: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' },
}
