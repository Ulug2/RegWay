import { useEffect, useState } from 'react'
import { getFirmId, getCachedFirmId, getCachedFirm, dismissRegulation, isFlagged, setFlagged as persistFlag, fetchNotes, addNote, fetchRelatedEntityMatches, rematchRegulation, type RelatedEntityMatch, type RematchResult } from '../lib/data'
import { readCache, writeCache } from '../lib/cache'
import type { Regulation, RegulationNote, AiContext } from '../lib/types'
import LogoMark from './LogoMark'
import CategoryBadge from './CategoryBadge'
import ImpactPanel from './ImpactPanel'

interface HeadlineDetailViewProps {
  onBack: () => void
  headline?: Partial<Regulation>
  onAskAI: (context: AiContext) => void
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

export default function HeadlineDetailView({ onBack, headline, onAskAI }: HeadlineDetailViewProps) {
  const [flagged, setFlaggedState] = useState(() => readCache<boolean>(`flag:${headline?.id}`) ?? false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [confirmDismiss, setConfirmDismiss] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [notes, setNotes] = useState<RegulationNote[]>(() => readCache<RegulationNote[]>(`notes:${headline?.id}`) ?? [])
  const [dateMode, setDateMode] = useState<typeof DATE_MODES[number]>("Today's Status")
  const [customDate, setCustomDate] = useState('')
  const [firmId, setFirmId] = useState<string | null>(getCachedFirmId)
  const [relatedMatches, setRelatedMatches] = useState<RelatedEntityMatch[]>([])
  const [focusEntity, setFocusEntity] = useState<string | null>(null)
  const [focusToken, setFocusToken] = useState(0)
  const [disputeOpen, setDisputeOpen] = useState(false)
  const [disputeNote, setDisputeNote] = useState('')
  const [disputing, setDisputing] = useState(false)
  const [disputeResult, setDisputeResult] = useState<RematchResult | null>(null)
  const [disputeError, setDisputeError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const regulationId = headline?.id
  const title = headline?.title || 'Untitled regulation'
  const jurisdiction = headline?.jurisdiction || headline?.agency || 'Unknown jurisdiction'
  // Labelled by which date it actually is: most items (proclamations,
  // advisories, notices) have no effective date, and showing the
  // publication date as "Effective" would invent one (spec §6).
  const dateLabel = headline?.effective_date
    ? `Effective ${formatDate(headline.effective_date)}`
    : headline?.published_date
      ? `Published ${formatDate(headline.published_date)}`
      : ''

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
    setDisputeOpen(false)
    setDisputeNote('')
    setDisputeResult(null)
    setDisputeError(null)
  }, [regulationId])

  useEffect(() => {
    if (!regulationId || !firmId) return
    const firmName = getCachedFirm()?.name ?? 'Firm'
    fetchRelatedEntityMatches(firmId, regulationId, firmName)
      .then(matches => setRelatedMatches(matches.length > 1 ? matches : []))
      .catch(() => setRelatedMatches([]))
  }, [regulationId, firmId])

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

  const dismiss = async () => {
    if (!regulationId || !firmId) return
    setDismissing(true)
    try {
      await dismissRegulation(firmId, regulationId)
      onBack()
    } catch {
      setDismissing(false)
      setConfirmDismiss(false)
    }
  }

  const submitDispute = async () => {
    if (!regulationId) return
    setDisputing(true)
    setDisputeError(null)
    try {
      const result = await rematchRegulation(regulationId, disputeNote.trim() || undefined)
      setDisputeResult(result)
      setRefreshToken(t => t + 1)
    } catch (err) {
      setDisputeError((err as Error).message || 'Something went wrong — try again.')
    } finally {
      setDisputing(false)
    }
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
            {headline?.category && <CategoryBadge category={headline.category} />}
            <span
              className="text-xs font-medium px-3 py-1"
              style={{ background: 'rgba(2,132,199,0.08)', color: '#0284C7', borderRadius: 9999 }}
            >
              {jurisdiction}
            </span>
            {dateLabel && <span className="text-xs" style={{ color: '#64748B' }}>{dateLabel}</span>}
          </div>
          <h1
            className="text-2xl font-semibold mb-3"
            style={{ color: '#0F172A', lineHeight: 1.35, letterSpacing: '-0.025em' }}
          >
            {title}
          </h1>

          {relatedMatches.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <span className="text-xs" style={{ color: '#64748B' }}>Also relevant to:</span>
              {relatedMatches.map(m => (
                <button
                  key={`${m.entity_type}-${m.entity_name}`}
                  onClick={() => { setFocusEntity(m.entity_name); setFocusToken(t => t + 1) }}
                  title={m.relevance_reason ?? undefined}
                  className="text-xs font-medium px-3 py-1 transition-colors hover:bg-sky-50"
                  style={{ borderRadius: 9999, border: '1px solid rgba(186,230,253,0.50)', color: '#0284C7', background: 'rgba(255,255,255,0.6)' }}
                >
                  {m.entity_name}
                </button>
              ))}
            </div>
          )}

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
            {regulationId && (
              <button
                onClick={() =>
                  onAskAI({
                    type: 'regulation',
                    id: regulationId,
                    name: title,
                    regulation: {
                      agency: headline?.agency,
                      jurisdiction: headline?.jurisdiction,
                      summary: headline?.summary,
                      published_date: headline?.published_date,
                      effective_date: headline?.effective_date,
                    },
                  })
                }
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-full transition-all hover:bg-sky-50"
                style={{ background: 'rgba(2,132,199,0.08)', color: '#0284C7', border: '1px solid rgba(2,132,199,0.20)' }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1.5l1.2 3 3 1.2-3 1.2L7 10l-1.2-3-3-1.2 3-1.2L7 1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
                </svg>
                Ask RegWay AI about this
              </button>
            )}

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

            {regulationId && headline?.category === 'regulatory' && (
              <button
                onClick={() => setDisputeOpen(o => !o)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-full transition-all"
                style={{
                  background: disputeOpen ? 'rgba(2,132,199,0.10)' : 'rgba(255,255,255,0.60)',
                  color: disputeOpen ? '#0284C7' : '#334155',
                  border: disputeOpen ? '1px solid rgba(2,132,199,0.25)' : '1px solid rgba(186,230,253,0.50)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M7 4.5v3M7 9.5h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                This match looks wrong?
              </button>
            )}

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

            {confirmDismiss ? (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: '#64748B' }}>Remove from your dashboard? Restore any time in Profile → Dismissed.</span>
                <button className="btn-primary" onClick={dismiss} disabled={dismissing}>{dismissing ? 'Dismissing…' : 'Dismiss'}</button>
                <button className="btn-ghost" onClick={() => setConfirmDismiss(false)}>Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDismiss(true)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-full transition-all hover:bg-sky-50"
                style={{ background: 'rgba(255,255,255,0.60)', color: '#334155', border: '1px solid rgba(186,230,253,0.50)' }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                Not relevant — dismiss
              </button>
            )}

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

          {/* Dispute drawer */}
          {disputeOpen && (
            <div
              className="mt-4 p-5 rounded-xl space-y-4"
              style={{ background: 'rgba(255,255,255,0.70)', border: '1px solid rgba(186,230,253,0.45)' }}
            >
              {disputeResult ? (
                <div className="space-y-3">
                  <div className="text-sm font-semibold" style={{ color: disputeResult.relevant ? '#0284C7' : '#B45309' }}>
                    {disputeResult.relevant ? 'Re-checked — still considered relevant.' : 'Re-checked — no longer considered relevant.'}
                  </div>
                  <p className="text-sm" style={{ color: '#334155', lineHeight: 1.6 }}>{disputeResult.reason}</p>
                  {!disputeResult.relevant && (
                    <p className="text-xs" style={{ color: '#94a3b8' }}>This will stop appearing on your dashboard the next time it loads.</p>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-xs" style={{ color: '#64748B' }}>
                    RegWay AI will re-check this match against your firm, fund, and company profiles as they stand right now. If a profile fact was wrong, correct it in Settings first — or describe what's off below and submit anyway.
                  </p>
                  <textarea
                    className="w-full text-sm resize-none"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: '#0F172A',
                      lineHeight: 1.6,
                      minHeight: 64,
                      fontFamily: 'Inter, sans-serif',
                    }}
                    placeholder={`Optional: what's wrong with this match? (e.g. "we don't actually operate in Texas")`}
                    value={disputeNote}
                    onChange={e => setDisputeNote(e.target.value)}
                    disabled={disputing}
                  />
                  {disputeError && <p className="text-xs" style={{ color: '#B45309' }}>{disputeError}</p>}
                  <div className="flex justify-end">
                    <button
                      className="text-xs px-4 py-2 rounded-full disabled:opacity-60"
                      style={{ background: 'linear-gradient(135deg,#0284C7,#38BDF8)', color: 'white' }}
                      onClick={submitDispute}
                      disabled={disputing}
                    >
                      {disputing ? 'Re-checking…' : 'Re-check this match'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

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

            <ImpactPanel regulationId={regulationId} fallbackSummary={headline?.summary} focusEntityName={focusEntity} focusToken={focusToken} refreshToken={refreshToken} />
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
