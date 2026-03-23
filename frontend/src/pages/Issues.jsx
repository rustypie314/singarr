import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useOutletContext } from 'react-router-dom'
import StatusBadge from '../components/StatusBadge.jsx'
import { IconIssue, IconPlus, IconTrash, IconCheck, IconRefresh } from '../components/Icons.jsx'
import toast from 'react-hot-toast'

const ISSUE_TYPES = [
  { value: 'missing_tracks', label: 'Missing Tracks',      emoji: '🎵' },
  { value: 'poor_quality',   label: 'Poor Audio Quality',  emoji: '🔊' },
  { value: 'other',          label: 'Other',               emoji: '💬' },
]

const STATUS_CONFIG = {
  open:        { label: 'Open',        color: '#e8a30f', bg: 'rgba(232,163,15,0.12)' },
  in_progress: { label: 'In Progress', color: '#4f9cf9', bg: 'rgba(79,156,249,0.12)' },
  resolved:    { label: 'Resolved',    color: '#2dbe6c', bg: 'rgba(26,122,69,0.15)'  },
}

function IssueStatusPill({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.open
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:999, background:cfg.bg, color:cfg.color, fontSize:11, fontWeight:700 }}>
      {cfg.label}
    </span>
  )
}

export default function Issues() {
  const { api, user } = useAuth()
  const ctx = useOutletContext()
  const [issues, setIssues]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [requests, setRequests]   = useState([])
  const [filter, setFilter]       = useState('all')
  const [confirmDelete, setConfirmDelete] = useState(null) // { id, title }

  // Form state
  const [formType, setFormType]   = useState('missing_tracks')
  const [formTitle, setFormTitle] = useState('')
  const [formDesc, setFormDesc]   = useState('')
  const [formReqId, setFormReqId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { fetchIssues(); fetchRequests() }, [])

  async function fetchIssues() {
    try {
      const r = await api.get('/issues')
      setIssues(r.data.issues || [])
    } catch { toast.error('Failed to load issues') }
    finally { setLoading(false) }
  }

  async function fetchRequests() {
    try {
      const r = await api.get('/requests')
      setRequests(r.data.requests || [])
    } catch {}
  }

  async function submitIssue(e) {
    e.preventDefault()
    if (!formTitle.trim()) return toast.error('Please enter a title')
    setSubmitting(true)
    try {
      await api.post('/issues', {
        type: formType,
        title: formTitle.trim(),
        description: formDesc.trim() || null,
        requestId: formReqId || null,
      })
      toast.success('Issue reported!')
      setShowForm(false)
      setFormTitle(''); setFormDesc(''); setFormReqId('')
      fetchIssues()
      ctx?.refreshCounts?.()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to submit issue')
    } finally { setSubmitting(false) }
  }

  async function updateStatus(id, status) {
    try {
      await api.put(`/issues/${id}`, { status })
      toast.success('Issue updated')
      fetchIssues()
      ctx?.refreshCounts?.()
    } catch { toast.error('Failed to update issue') }
  }

  async function deleteIssue(id, title) {
    setConfirmDelete({ id, title })
  }

  async function confirmDeleteIssue() {
    const { id } = confirmDelete
    setConfirmDelete(null)
    try {
      await api.delete(`/issues/${id}`)
      setIssues(i => i.filter(x => x.id !== id))
      ctx?.refreshCounts?.()
    } catch { toast.error('Failed to delete issue') }
  }

  async function addAdminNote(id, note) {
    // kept for compat — notes now handled inside IssueCard via thread
  }

  const filtered = filter === 'all' ? issues : issues.filter(i => i.status === filter)
  const counts = { all: issues.length, open: issues.filter(i => i.status === 'open').length, in_progress: issues.filter(i => i.status === 'in_progress').length, resolved: issues.filter(i => i.status === 'resolved').length }

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div>
          <h1 style={s.pageTitle}>Issues</h1>
          <p style={s.pageSubtitle}>{user?.isAdmin ? 'All reported issues' : 'Report problems with downloaded music'}</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={fetchIssues} style={s.iconBtn} title="Refresh">
            <IconRefresh size={15} color="currentColor" />
          </button>
          <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }}
            onClick={() => setShowForm(true)} style={s.newBtn}>
            <IconPlus size={15} color="#fff" />
            Report Issue
          </motion.button>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={s.filterRow}>
        {['all','open','in_progress','resolved'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            ...s.filterBtn,
            background: filter === f ? 'var(--accent-muted)' : 'transparent',
            color: filter === f ? 'var(--accent)' : 'var(--text-secondary)',
            borderColor: filter === f ? 'var(--accent)' : 'var(--border)',
          }}>
            {f === 'all' ? 'All' : f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
            <span style={s.filterCount}>{counts[f]}</span>
          </button>
        ))}
      </div>

      {/* Issues list */}
      {loading ? (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {[...Array(3)].map((_,i) => <div key={i} className="skeleton" style={{ height:90, borderRadius:12 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div style={s.empty}>
          <IconIssue size={40} color="var(--text-muted)" style={{ opacity:0.25 }} />
          <p style={{ color:'var(--text-muted)', fontSize:15 }}>
            {filter === 'all' ? 'No issues reported yet' : `No ${filter.replace('_',' ')} issues`}
          </p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {filtered.map((issue, i) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              index={i}
              isAdmin={user?.isAdmin}
              onUpdateStatus={updateStatus}
              onDelete={(id) => deleteIssue(id, issue.title)}
              api={api}
            />
          ))}
        </div>
      )}

      {/* New issue modal */}
      <AnimatePresence>
        {showForm && (
          <div style={s.overlay} onClick={() => setShowForm(false)}>
            <motion.div
              initial={{ opacity:0, scale:0.93, y:16 }}
              animate={{ opacity:1, scale:1, y:0 }}
              exit={{ opacity:0, scale:0.96 }}
              transition={{ type:'spring', stiffness:320, damping:28 }}
              style={s.modal}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                <IconIssue size={20} color="var(--accent)" />
                <h2 style={{ fontSize:18, fontWeight:800, color:'var(--text-primary)' }}>Report an Issue</h2>
                <button onClick={() => setShowForm(false)} style={{ marginLeft:'auto', background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:16 }}>✕</button>
              </div>

              <form onSubmit={submitIssue}>
                <div style={s.field}>
                  <label style={s.label}>Issue type</label>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {ISSUE_TYPES.map(t => (
                      <button key={t.value} type="button" onClick={() => setFormType(t.value)}
                        style={{ ...s.typeBtn, background: formType === t.value ? 'var(--accent-muted)' : 'var(--bg-overlay)', border: `1px solid ${formType === t.value ? 'var(--accent)' : 'var(--border)'}`, color: formType === t.value ? 'var(--accent)' : 'var(--text-secondary)' }}>
                        {t.emoji} {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={s.field}>
                  <label style={s.label}>Title <span style={{ color:'var(--status-rejected)' }}>*</span></label>
                  <input value={formTitle} onChange={e => setFormTitle(e.target.value)}
                    placeholder="Brief description of the problem"
                    style={s.input} autoFocus />
                </div>

                <div style={s.field}>
                  <label style={s.label}>Details <span style={{ color:'var(--text-muted)', fontWeight:400 }}>(optional)</span></label>
                  <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)}
                    placeholder="More details, affected tracks, timestamps…"
                    style={{ ...s.input, minHeight:80, resize:'vertical' }} />
                </div>

                {requests.length > 0 && (
                  <div style={s.field}>
                    <label style={s.label}>Related request <span style={{ color:'var(--text-muted)', fontWeight:400 }}>(optional)</span></label>
                    <select value={formReqId} onChange={e => setFormReqId(e.target.value)} style={s.input}>
                      <option value="">— Select a request —</option>
                      {requests.map(r => (
                        <option key={r.id} value={r.id}>{r.title}{r.artist_name ? ` — ${r.artist_name}` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ display:'flex', gap:10, marginTop:8 }}>
                  <button type="button" onClick={() => setShowForm(false)} style={s.cancelBtn}>Cancel</button>
                  <motion.button type="submit" whileHover={{ scale:1.01 }} whileTap={{ scale:0.99 }}
                    disabled={submitting} style={{ ...s.submitBtn, opacity: submitting ? 0.75 : 1 }}>
                    {submitting ? 'Submitting…' : 'Submit Issue'}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div style={s.overlay} onClick={() => setConfirmDelete(null)}>
          <motion.div
            initial={{ opacity:0, scale:0.93, y:16 }}
            animate={{ opacity:1, scale:1, y:0 }}
            exit={{ opacity:0, scale:0.96 }}
            transition={{ type:'spring', stiffness:320, damping:28 }}
            style={{ ...s.modal, maxWidth:400 }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ fontSize:17, fontWeight:700, color:'var(--text-primary)', marginBottom:8 }}>Delete issue?</h2>
            <p style={{ fontSize:14, color:'var(--text-secondary)', lineHeight:1.6, marginBottom:20 }}>
              <strong style={{ color:'var(--text-primary)' }}>{confirmDelete.title}</strong> will be permanently deleted. This cannot be undone.
            </p>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setConfirmDelete(null)}
                style={{ flex:1, padding:11, background:'var(--bg-overlay)', border:'1px solid var(--border)', borderRadius:'var(--radius-md)', color:'var(--text-secondary)', fontSize:14, fontWeight:600, fontFamily:'var(--font-sans)', cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={confirmDeleteIssue}
                style={{ flex:1, padding:11, background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.4)', borderRadius:'var(--radius-md)', color:'#ef4444', fontSize:14, fontWeight:700, fontFamily:'var(--font-sans)', cursor:'pointer' }}>
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

function IssueCard({ issue: initialIssue, index, isAdmin, onUpdateStatus, onDelete, api }) {
  const { user } = useAuth()
  const [issue, setIssue] = useState(initialIssue)
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState(null)
  const [newNote, setNewNote] = useState('')
  const [posting, setPosting] = useState(false)
  const typeCfg = ISSUE_TYPES.find(t => t.value === issue.type) || ISSUE_TYPES[2]
  const isLocked = issue.status === 'resolved'
  const isOwner = user?.id === issue.user_id
  const sseRef = useRef(null)

  async function loadNotes() {
    try {
      const r = await api.get(`/issues/${issue.id}/notes`)
      setNotes(r.data.notes || [])
    } catch { setNotes([]) }
  }

  // Connect SSE when expanded, disconnect when collapsed
  useEffect(() => {
    if (!expanded) {
      if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
      return;
    }

    const token = localStorage.getItem('singarr-token');
    if (!token) return;

    const es = new EventSource(`/api/issues/${issue.id}/stream?token=${encodeURIComponent(token)}`);
    sseRef.current = es;

    es.addEventListener('note', (e) => {
      try {
        const note = JSON.parse(e.data);
        setNotes(prev => {
          if (!prev) return [note];
          // Avoid duplicates (our own posts are added optimistically)
          if (prev.some(n => n.id === note.id)) return prev;
          return [...prev, note];
        });
      } catch {}
    });

    es.addEventListener('status', (e) => {
      try {
        const { status } = JSON.parse(e.data);
        setIssue(prev => ({ ...prev, status }));
      } catch {}
    });

    es.onerror = () => {
      // Connection dropped — reconnect after 3s
      es.close();
      sseRef.current = null;
    };

    return () => { es.close(); sseRef.current = null; };
  }, [expanded, issue.id]);

  function handleExpand() {
    setExpanded(e => !e)
    if (!expanded && notes === null) loadNotes()
  }

  async function postNote(e) {
    e.preventDefault()
    if (!newNote.trim()) return
    setPosting(true)
    try {
      const r = await api.post(`/issues/${issue.id}/notes`, { body: newNote.trim() })
      setNotes(prev => [...(prev || []), r.data.note])
      setNewNote('')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to post note')
    } finally { setPosting(false) }
  }

  function formatTime(dt) {
    const d = new Date(dt)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  return (
    <motion.div
      initial={{ opacity:0, x:-10 }} animate={{ opacity:1, x:0 }}
      transition={{ delay: index * 0.04 }}
      style={s.card}
    >
      {/* Header row */}
      <div style={s.cardRow} onClick={handleExpand}>
        <div style={{ fontSize:22, flexShrink:0 }}>{typeCfg.emoji}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)' }}>{issue.title}</span>
            {isLocked && <span title="Thread locked" style={{ fontSize:13 }}>🔒</span>}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4, flexWrap:'wrap' }}>
            <span style={{ fontSize:11, color:'var(--accent)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em' }}>{typeCfg.label}</span>
            {isAdmin && issue.username && <span style={{ fontSize:11, color:'var(--text-muted)' }}>by {issue.username}</span>}
            <span style={{ fontSize:11, color:'var(--text-muted)' }}>{new Date(issue.created_at).toLocaleDateString()}</span>
            {issue.request_title && <span style={{ fontSize:11, color:'var(--text-muted)' }}>· {issue.request_title}</span>}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          <IssueStatusPill status={issue.status} />
          <span style={{ fontSize:12, color:'var(--text-muted)', transition:'transform 200ms', display:'inline-block', transform: expanded ? 'rotate(180deg)' : 'none' }}>▾</span>
        </div>
      </div>

      {/* Expanded */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }} transition={{ duration:0.2 }}
            style={{ borderTop:'1px solid var(--border)', overflow:'hidden' }}>
            <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:14 }}>

              {/* Description */}
              {issue.description && (
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>Description</div>
                  <div style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.6 }}>{issue.description}</div>
                </div>
              )}

              {/* Status buttons — admin only */}
              {isAdmin && (
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Status</div>
                  <div style={{ display:'flex', gap:6 }}>
                    {['open','in_progress','resolved'].map(st => {
                      const isDisabled = (st === 'open' && (issue.status === 'in_progress' || issue.status === 'resolved'))
                                      || (st === 'in_progress' && issue.status === 'resolved')
                                      || (st === 'resolved' && issue.status === 'resolved')
                      return (
                        <button key={st}
                          onClick={() => !isDisabled && onUpdateStatus(issue.id, st)}
                          disabled={isDisabled}
                          style={{ padding:'5px 12px', borderRadius:999, border:'1px solid', fontSize:11, fontWeight:700,
                            cursor: isDisabled ? 'not-allowed' : 'pointer', fontFamily:'var(--font-sans)',
                            background: issue.status === st ? STATUS_CONFIG[st].bg : 'transparent',
                            color: (isDisabled && st !== issue.status) ? 'var(--text-muted)' : STATUS_CONFIG[st].color,
                            borderColor: (isDisabled && st !== issue.status) ? 'var(--border)' : issue.status === st ? STATUS_CONFIG[st].color : 'var(--border)',
                            opacity: (isDisabled && st !== issue.status) ? 0.4 : 1,
                          }}>
                          {st === 'in_progress' ? 'In Progress' : st.charAt(0).toUpperCase() + st.slice(1)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Notes thread */}
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>
                  Notes {notes !== null && notes.length > 0 && `(${notes.length})`}
                </div>

                {notes === null ? (
                  <div style={{ fontSize:13, color:'var(--text-muted)', padding:'8px 0' }}>Loading…</div>
                ) : notes.length === 0 ? (
                  <div style={{ fontSize:13, color:'var(--text-muted)', padding:'4px 0' }}>No notes yet. Be the first to add one.</div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12 }}>
                    {notes.map(note => {
                      const isSystem = note.note_type === 'system'
                      const isNoteAdmin = !!(note.is_admin || note.is_local_admin)

                      // System activity entry — centered pill style
                      if (isSystem) return (
                        <div key={note.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0' }}>
                          <div style={{ flex:1, height:1, background:'var(--border)' }} />
                          <span style={{ fontSize:11, color:'var(--text-muted)', whiteSpace:'nowrap' }}>
                            {note.body} · {formatTime(note.created_at)}
                          </span>
                          <div style={{ flex:1, height:1, background:'var(--border)' }} />
                        </div>
                      )

                      return (
                        <div key={note.id} style={{ display:'flex', gap:10 }}>
                          {/* Avatar */}
                          <div style={{
                            width:28, height:28, borderRadius:'50%', flexShrink:0, marginTop:2,
                            background: isNoteAdmin ? '#1a7a45' : 'var(--bg-overlay)',
                            display:'flex', alignItems:'center', justifyContent:'center',
                            fontSize:11, fontWeight:700,
                            color: isNoteAdmin ? '#fff' : 'var(--text-secondary)',
                          }}>
                            {note.username?.[0]?.toUpperCase()}
                          </div>
                          {/* Bubble */}
                          <div style={{
                            flex:1,
                            background: isNoteAdmin ? 'rgba(26,122,69,0.07)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${isNoteAdmin ? 'rgba(26,122,69,0.2)' : 'rgba(255,255,255,0.07)'}`,
                            borderLeft: `3px solid ${isNoteAdmin ? '#1a7a45' : 'rgba(255,255,255,0.15)'}`,
                            borderRadius:'0 8px 8px 0',
                            padding:'9px 12px',
                          }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                              <span style={{ fontSize:12, fontWeight:700, color: isNoteAdmin ? '#2dbe6c' : 'var(--text-primary)' }}>{note.username}</span>
                              {isNoteAdmin && <span style={{ fontSize:10, padding:'1px 6px', borderRadius:999, background:'rgba(26,122,69,0.2)', color:'#2dbe6c', fontWeight:700 }}>Admin</span>}
                              <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:'auto' }}>{formatTime(note.created_at)}</span>
                            </div>
                            <div style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.55 }}>{note.body}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Reply box or locked message */}
                {isLocked ? (
                  <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)', borderRadius:8, fontSize:13, color:'var(--text-muted)' }}>
                    <span>🔒</span> This issue is resolved and the thread is locked.
                  </div>
                ) : (isAdmin || isOwner) && (
                  <form onSubmit={postNote} style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                    <div style={{
                      width:28, height:28, borderRadius:'50%', flexShrink:0, marginTop:2,
                      background: isAdmin ? '#1a7a45' : 'var(--bg-overlay)',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:11, fontWeight:700,
                      color: isAdmin ? '#fff' : 'var(--text-secondary)',
                    }}>
                      {user?.username?.[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex:1 }}>
                      <textarea
                        value={newNote} onChange={e => setNewNote(e.target.value)}
                        placeholder="Add a note…"
                        style={{ width:'100%', padding:'9px 12px', background:'var(--bg-overlay)', border:'1px solid var(--border-strong)', borderRadius:8, color:'var(--text-primary)', fontSize:13, fontFamily:'var(--font-sans)', resize:'none', minHeight:64, boxSizing:'border-box', outline:'none' }}
                      />
                      <div style={{ display:'flex', justifyContent:'flex-end', marginTop:6 }}>
                        <button type="submit" disabled={posting || !newNote.trim()}
                          style={{ padding:'7px 16px', background:'var(--accent)', border:'none', borderRadius:7, color:'#fff', fontSize:12, fontWeight:700, cursor: posting || !newNote.trim() ? 'default' : 'pointer', fontFamily:'var(--font-sans)', opacity: posting || !newNote.trim() ? 0.5 : 1 }}>
                          {posting ? 'Posting…' : 'Post'}
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>

              {/* Admin delete / Owner close if opened in error */}
              <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
                {isOwner && !isAdmin && issue.status === 'open' && (
                  <button onClick={() => onUpdateStatus(issue.id, 'resolved')}
                    style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', background:'none', border:'1px solid rgba(255,255,255,0.15)', borderRadius:7, color:'var(--text-secondary)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--font-sans)' }}>
                    Close issue
                  </button>
                )}
                {isAdmin && (
                  <button onClick={() => onDelete(issue.id)}
                    style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', background:'none', border:'1px solid rgba(239,68,68,0.3)', borderRadius:7, color:'#ef4444', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--font-sans)' }}>
                    <IconTrash size={13} color="currentColor" />
                    Delete
                  </button>
                )}
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

const s = {
  root: { maxWidth:860, margin:'0 auto' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, gap:12, flexWrap:'wrap' },
  pageTitle: { fontSize:28, fontWeight:800, color:'var(--text-primary)', letterSpacing:'-0.5px' },
  pageSubtitle: { fontSize:14, color:'var(--text-secondary)', marginTop:4 },
  iconBtn: { padding:'8px 10px', background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:'var(--radius-md)', color:'var(--text-secondary)', cursor:'pointer', display:'flex', alignItems:'center' },
  newBtn: { padding:'9px 18px', background:'var(--accent)', border:'none', borderRadius:'var(--radius-md)', color:'#fff', fontSize:14, fontWeight:700, fontFamily:'var(--font-sans)', cursor:'pointer', display:'flex', alignItems:'center', gap:7 },
  filterRow: { display:'flex', gap:6, flexWrap:'wrap', marginBottom:18 },
  filterBtn: { padding:'5px 12px', border:'1px solid', borderRadius:999, fontSize:12, fontWeight:600, fontFamily:'var(--font-sans)', cursor:'pointer', transition:'var(--transition)', display:'flex', alignItems:'center', gap:6 },
  filterCount: { background:'var(--bg-overlay)', padding:'1px 6px', borderRadius:999, fontSize:10, fontFamily:'var(--font-mono)' },
  empty: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'60px 20px', gap:12 },
  card: { background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' },
  cardRow: { display:'flex', alignItems:'center', gap:12, padding:'12px 16px', cursor:'pointer' },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:16 },
  modal: { background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:'var(--radius-xl)', padding:'28px', width:'100%', maxWidth:480, boxShadow:'0 32px 64px rgba(0,0,0,0.4)' },
  field: { marginBottom:16 },
  label: { display:'block', fontSize:13, fontWeight:600, color:'var(--text-secondary)', marginBottom:7 },
  input: { width:'100%', padding:'10px 13px', background:'var(--bg-overlay)', border:'1px solid var(--border-strong)', borderRadius:8, color:'var(--text-primary)', fontSize:14, fontFamily:'var(--font-sans)', outline:'none' },
  typeBtn: { padding:'8px 14px', borderRadius:8, fontSize:13, fontWeight:600, fontFamily:'var(--font-sans)', cursor:'pointer', transition:'var(--transition)' },
  cancelBtn: { flex:1, padding:11, background:'var(--bg-overlay)', border:'1px solid var(--border)', borderRadius:'var(--radius-md)', color:'var(--text-secondary)', fontSize:14, fontWeight:600, fontFamily:'var(--font-sans)', cursor:'pointer' },
  submitBtn: { flex:1, padding:11, background:'var(--accent)', border:'none', borderRadius:'var(--radius-md)', color:'#fff', fontSize:14, fontWeight:700, fontFamily:'var(--font-sans)', cursor:'pointer' },
}
