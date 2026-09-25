import { useEffect, useState } from 'react'
import { getFirmId, getCachedFirmId, isFlagged, setFlagged as persistFlag, fetchNotes, addNote } from '../lib/data'
import { readCache, writeCache } from '../lib/cache'
import type { Regulation, RegulationNote } from '../lib/types'
import LogoMark from './LogoMark'

interface HeadlineDetailViewProps {
  onBack: () => void
  headline?: Partial<Regulation>
}

const DATE_MODES = ["Today's Status", 'Custom Range'] as const

function formatDate(iso?: string | null) {
  if (!iso) return null
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function sourceDomain(url?: string) {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

export default function HeadlineDetailView({ onBack, headline }: HeadlineDetailViewProps) {
  const [flagged, setFlaggedState] = useState(() => readCache<boolean>(`flag:${headline?.id}`) ?? false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [notes, setNotes] = useState<RegulationNote[]>(() => readCache<RegulationNote[]>(`notes:${headline?.id}`) ?? [])
  const [dateMode, setDateMode] = useState<typeof DATE_MODES[number]>("Today's Status")
  const [customDate, setCustomDate] = useState('')
  const [firmId, setFirmId] = useState<string | null>(getCachedFirmId)

  const regulationId = headline?.id
  const title = headline?.title || 'Untitled regulation'
  const jurisdiction = headline?.jurisdiction || headline?.agency || 'Unknown jurisdiction'
  const publishedLabel = formatDate(headline?.effective_date) || formatDate(headline?.published_date)

  useEffect(() => {
    if (!regulationId) return
    getFirmId().then(id => setFirmId(id))
    isFlagged(regulationId).then(f => {
      setFlaggedState(f)
      writeCache(`flag:${regulationId}`, f)
    })
    fetchNotes(regulationId).then(n => {
      setNotes(n)
      writeCache(`notes:${regulationId}`, n)
    })
  }, [regulationId])

  const toggleFlag = async () => {
    if (!regulationId || !firmId) return
    const next = !flagged
    setFlaggedState(next)
    writeCache(`flag:${regulationId}`, next)
    await persistFlag(regulationId, firmId, next).catch(() => {
      setFlaggedState(!next)
      writeCache(`flag:${regulationId}`, !next)
    })
  }

  const saveNote = async () => {
    if (!regulationId || !firmId || !noteDraft.trim()) return
    await addNote(regulationId, firmId, noteDraft.trim())
    setNoteDraft('')
    const updated = await fetchNotes(regulationId)
    setNotes(updated)
    writeCache(`notes:${regulationId}`, updated)
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* Top Nav */}
      <header className="glass-nav sticky top-0 z-40">
        <div className="max-w-[1200px] mx-auto px-8 h-20 flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl transition-all hover:bg-sky-50"
            style={{ color: '#334155', border: '1px solid rgba(186,230,253,0.40)', background: 'rgba(255,255,255,0.60)' }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back to Dashboard
          </button>
          <div className="flex items-center gap-2">
            <LogoMark size={24} />
            <span className="font-semibold text-sm" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}>RegWay</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1200px] mx-auto w-full px-8" style={{ paddingTop: 48, paddingBottom: 64 }}>

        {/* Article Header */}
        <div className="glass-card" style={{ padding: 40, marginBottom: 32 }}>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span
              className="text-xs font-medium px-3 py-1"
              style={{ background: 'rgba(2,132,199,0.08)', color: '#0284C7', borderRadius: 9999 }}
            >
              {jurisdiction}
            </span>
            {publishedLabel && <span className="text-xs" style={{ color: '#64748B' }}>Effective {publishedLabel}</span>}
          </div>
          <h1
            className="text-2xl font-semibold mb-3"
            style={{ color: '#0F172A', lineHeight: 1.35, letterSpacing: '-0.025em' }}
          >
            {title}
          </h1>
          {/* Contextual Date Filter */}
          <div className="flex items-center gap-3 flex-wrap mt-6 pt-5" style={{ borderTop: '1px solid rgba(186,230,253,0.30)' }}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>History</span>
            <div className="flex items-center gap-1 p-1" style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(186,230,253,0.35)', borderRadius: 9999 }}>
              {DATE_MODES.map(mode => (
                <button
                  key={mode}
                  onClick={() => setDateMode(mode)}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-full transition-all"
                  style={{
                    background: dateMode === mode ? 'linear-gradient(135deg,#0284C7,#38BDF8)' : 'transparent',
                    color: dateMode === mode ? 'white' : '#64748B',
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
            {dateMode === 'Custom Range' && (
              <input
                type="date"
                className="glass-input-rect"
                style={{ width: 170, borderRadius: 9999 }}
                value={customDate}
                onChange={e => setCustomDate(e.target.value)}
              />
            )}
          </div>

          {/* Action Toolbar */}
          <div
            className="flex items-center gap-3 flex-wrap mt-5 pt-5"
            style={{ borderTop: '1px solid rgba(186,230,253,0.30)' }}
          >
            <button
              onClick={toggleFlag}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-full transition-all"
              style={{
                background: flagged ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.60)',
                color: flagged ? '#B45309' : '#334155',
                border: flagged ? '1px solid rgba(245,158,11,0.35)' : '1px solid rgba(186,230,253,0.50)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill={flagged ? '#F59E0B' : 'none'}>
                <path d="M2 2h8l-2 4 2 4H2V2z" stroke={flagged ? '#B45309' : '#64748B'} strokeWidth="1.3" strokeLinejoin="round"/>
                <path d="M2 2v10" stroke={flagged ? '#B45309' : '#64748B'} strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              {flagged ? 'Flagged for Review' : 'Flag for Review'}
            </button>

            <button
              onClick={() => setNoteOpen(o => !o)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-full transition-all"
              style={{
                background: noteOpen ? 'rgba(2,132,199,0.10)' : 'rgba(255,255,255,0.60)',
                color: noteOpen ? '#0284C7' : '#334155',
                border: noteOpen ? '1px solid rgba(2,132,199,0.25)' : '1px solid rgba(186,230,253,0.50)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="2" y="2" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M5 5h4M5 7h4M5 9h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              {notes.length > 0 ? `Notes (${notes.length})` : 'Add Note'}
            </button>

            {headline?.source_url && (
              <a
                href={headline.source_url}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-full transition-all ml-auto"
                style={{
                  background: 'linear-gradient(135deg,#0284C7,#38BDF8)',
                  color: 'white',
                  boxShadow: '0 4px 12px rgba(2,132,199,0.25)',
                }}
                target="_blank"
                rel="noreferrer"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M5 2H3a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V9M8 2h4m0 0v4m0-4L6 8" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                View Official Source Documentation
              </a>
            )}
          </div>

          {/* Notes drawer */}
          {noteOpen && (
            <div
              className="mt-4 p-5 rounded-xl space-y-4"
              style={{ background: 'rgba(255,255,255,0.70)', border: '1px solid rgba(186,230,253,0.45)' }}
            >
              {notes.map(n => (
                <div key={n.id} className="pb-3" style={{ borderBottom: '1px solid rgba(186,230,253,0.30)' }}>
                  <div className="text-xs font-medium mb-1" style={{ color: '#94a3b8' }}>
                    {new Date(n.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                  <div className="text-sm" style={{ color: '#0F172A', lineHeight: 1.6 }}>{n.body}</div>
                </div>
              ))}
              <div>
                <textarea
                  className="w-full text-sm resize-none"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: '#0F172A',
                    lineHeight: 1.6,
                    minHeight: 80,
                    fontFamily: 'Inter, sans-serif',
                  }}
                  placeholder="Log a firm-specific observation tied to this regulation..."
                  value={noteDraft}
                  onChange={e => setNoteDraft(e.target.value)}
                />
                <div className="flex justify-end mt-2">
                  <button
                    className="text-xs px-4 py-2 rounded-full"
                    style={{ background: 'linear-gradient(135deg,#0284C7,#38BDF8)', color: 'white' }}
                    onClick={saveNote}
                  >
                    Save Note
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main deep-dive layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">

            {/* Context & Overview */}
            <div className="glass-card" style={{ padding: 32 }}>
              <h2 className="text-lg font-semibold mb-4" style={{ color: '#0F172A' }}>Context & Overview</h2>
              {headline?.summary ? (
                <p className="text-sm" style={{ color: '#334155', lineHeight: 1.75 }}>{headline.summary}</p>
              ) : (
                <p className="text-sm" style={{ color: '#94a3b8', lineHeight: 1.7 }}>
                  No summary is available for this item yet.
                </p>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {headline?.source_url && (
              <div className="glass-card" style={{ padding: 24 }}>
                <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#64748B' }}>
                  Primary Source
                </div>
                <a
                  href={headline.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block p-4 rounded-xl transition-all hover:shadow-md"
                  style={{ background: 'rgba(2,132,199,0.06)', border: '1px solid rgba(2,132,199,0.15)' }}
                >
                  {sourceDomain(headline.source_url) && (
                    <div className="text-xs font-medium mb-1" style={{ color: '#0284C7' }}>{sourceDomain(headline.source_url)}</div>
                  )}
                  <div className="text-sm font-semibold" style={{ color: '#0F172A', lineHeight: 1.4 }}>
                    {title}
                  </div>
                  <div className="flex items-center gap-1 mt-3 text-xs" style={{ color: '#0284C7' }}>
                    View source
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M1 9L9 1M9 1H4M9 1v5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  </div>
                </a>
              </div>
            )}

            <div className="glass-card" style={{ padding: 24 }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#64748B' }}>
                Regulatory Metadata
              </div>
              <div className="space-y-2.5">
                {[
                  { label: 'Agency', value: headline?.agency },
                  { label: 'Jurisdiction', value: headline?.jurisdiction },
                  { label: 'Published', value: formatDate(headline?.published_date) },
                  { label: 'Effective', value: formatDate(headline?.effective_date) },
                  { label: 'Source', value: headline?.source },
                ]
                  .filter(item => item.value)
                  .map(item => (
                    <div key={item.label} className="flex justify-between text-xs gap-3">
                      <span style={{ color: '#94a3b8' }}>{item.label}</span>
                      <span className="font-medium text-right" style={{ color: '#334155' }}>{item.value}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        className="mt-8"
        style={{
          background: 'rgba(255,255,255,0.60)',
          backdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(186,230,253,0.30)',
        }}
      >
        <div className="max-w-[1200px] mx-auto px-8 py-5 flex items-center justify-between">
          <div className="text-xs" style={{ color: '#94a3b8' }}>
            RegWay · Regulatory intelligence for private markets · © 2026
          </div>
          <div className="flex items-center gap-6">
            {['About Us', 'Sources', 'Legal Disclaimers'].map(link => (
              <a key={link} href="#" className="text-xs hover:text-sky-600 transition-colors" style={{ color: '#64748B' }}>
                {link}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
