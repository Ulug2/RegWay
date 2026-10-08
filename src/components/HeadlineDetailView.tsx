import { useEffect, useState } from 'react'
import { getFirmId, getCachedFirmId, getCachedFirm, dismissRegulation, isFlagged, setFlagged as persistFlag, fetchNotes, addNote, fetchPublishedVersions, fetchRelatedEntityMatches, rematchRegulation, type RelatedEntityMatch, type RematchResult } from '../lib/data'
import { readCache, writeCache } from '../lib/cache'
import type { MatchedRegulation, PublishedVersion, Regulation, RegulationNote, AiContext } from '../lib/types'
import { publisherName } from '../lib/duplicates'
import PageHeader from './PageHeader'
import SiteFooter from './SiteFooter'
import { ArrowSquareOut, ArrowUpRight, Flag, NotePencil, Sparkle, WarningCircle, X } from './icons'
import CategoryBadge from './CategoryBadge'
import PrePublicationBadge from './PrePublicationBadge'
import ImpactPanel from './ImpactPanel'

interface HeadlineDetailViewProps {
  onBack: () => void
  // Where Back goes, as the button says it.
  backLabel?: string
  headline?: Partial<Regulation> & Pick<MatchedRegulation, 'also_published_as'>
  onAskAI: (context: AiContext) => void
}

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

export default function HeadlineDetailView({ onBack, backLabel = 'Back to Dashboard', headline, onAskAI }: HeadlineDetailViewProps) {
  const [flagged, setFlaggedState] = useState(() => readCache<boolean>(`flag:${headline?.id}`) ?? false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [confirmDismiss, setConfirmDismiss] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [notes, setNotes] = useState<RegulationNote[]>(() => readCache<RegulationNote[]>(`notes:${headline?.id}`) ?? [])
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
  // The same development's other versions (lib/duplicates.ts): what the
  // list already knew, then refreshed.
  const [versions, setVersions] = useState<PublishedVersion[]>(headline?.also_published_as ?? [])

  const regulationId = headline?.id
  const title = headline?.title || 'Untitled regulation'
  const jurisdiction = headline?.jurisdiction || headline?.agency || 'Unknown jurisdiction'
  // Labelled by which date it actually is: most items (proclamations,
  // advisories, notices) have no effective date, and showing the
  // publication date as "Effective" would invent one (spec §6).
  // A document on public inspection isn't published yet: its date is when
  // it's scheduled to be.
  const prePublication = !!headline?.on_public_inspection
  const dateLabel = headline?.effective_date
    ? `Effective ${formatDate(headline.effective_date)}`
    : headline?.published_date
      ? `${prePublication ? 'Publishes' : 'Published'} ${formatDate(headline.published_date)}`
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
    fetchPublishedVersions({ id: regulationId, duplicate_of: headline?.duplicate_of }).then(setVersions).catch(() => {})
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
      setDisputeError((err as Error).message || 'Something went wrong. Try again.')
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

  const askAI = () =>
    regulationId &&
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

  const facts = [
    { label: 'Agency', value: headline?.agency },
    { label: 'Jurisdiction', value: headline?.jurisdiction },
    { label: prePublication ? 'Scheduled publication' : 'Published', value: formatDate(headline?.published_date) },
    { label: 'Effective', value: formatDate(headline?.effective_date) },
    { label: 'Source', value: headline?.source && headline.source_url ? publisherName({ source: headline.source, source_url: headline.source_url }) : null },
  ].filter(item => item.value)

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <a href="#main" className="skip-link">Skip to content</a>
      <PageHeader back={{ label: backLabel, onClick: onBack }} />

      <main id="main" className="flex-1 w-full max-w-[1200px] mx-auto px-5 sm:px-8 pt-8 sm:pt-10 pb-16">

        {/* Article header */}
        <div className="glass-card p-6 sm:p-9 mb-6 sm:mb-8">
          <div className="flex items-center gap-x-3 gap-y-2 mb-4 flex-wrap">
            {headline?.category && <CategoryBadge category={headline.category} />}
            {prePublication && <PrePublicationBadge />}
            <span className="text-[13px] font-medium" style={{ color: 'var(--text-600)' }}>{jurisdiction}</span>
            {dateLabel && <span className="text-[13px] num" style={{ color: 'var(--text-400)' }}>{dateLabel}</span>}
          </div>
          <h1 className="text-2xl sm:text-[30px] font-semibold break-words" style={{ color: 'var(--text-900)', lineHeight: 1.2, letterSpacing: '-0.03em', maxWidth: '26em' }}>
            {title}
          </h1>

          {relatedMatches.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mt-4">
              <span className="text-[13px]" style={{ color: 'var(--text-400)' }}>Also relevant to:</span>
              {relatedMatches.map(m => (
                <button
                  key={`${m.entity_type}-${m.entity_name}`}
                  onClick={() => { setFocusEntity(m.entity_name); setFocusToken(t => t + 1) }}
                  title={m.relevance_reason ?? undefined}
                  className="btn-tool"
                  style={{ padding: '4px 12px', fontSize: 13, color: 'var(--primary)' }}
                >
                  {m.entity_name}
                </button>
              ))}
            </div>
          )}

          {/* Actions: the source on the right, everything else in one row */}
          <div className="flex items-center gap-2 flex-wrap mt-7 pt-5" style={{ borderTop: '1px solid rgb(var(--line-rgb) / 0.35)' }}>
            {regulationId && (
              <button onClick={askAI} className="btn-tool is-accent">
                <Sparkle size={16} aria-hidden="true" />
                Ask RegWay AI about this
              </button>
            )}

            <button onClick={toggleFlag} aria-pressed={flagged} className={`btn-tool ${flagged ? 'is-warn' : ''}`}>
              <Flag size={16} weight={flagged ? 'fill' : 'regular'} aria-hidden="true" />
              {flagged ? 'Flagged for Review' : 'Flag for Review'}
            </button>

            {regulationId && (headline?.category === 'regulatory' || headline?.category === 'geopolitical') && (
              <button onClick={() => setDisputeOpen(o => !o)} aria-expanded={disputeOpen} className="btn-tool">
                <WarningCircle size={16} aria-hidden="true" />
                This match looks wrong?
              </button>
            )}

            <button onClick={() => setNoteOpen(o => !o)} aria-expanded={noteOpen} className="btn-tool">
              <NotePencil size={16} aria-hidden="true" />
              {notes.length > 0 ? `Notes (${notes.length})` : 'Add Note'}
            </button>

            {confirmDismiss ? (
              <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Confirm dismissal">
                <span className="text-[13px]" style={{ color: 'var(--text-400)' }}>Remove from your dashboard? Restore any time in Profile → Dismissed.</span>
                <button className="btn-primary btn-sm" onClick={dismiss} disabled={dismissing}>{dismissing ? 'Dismissing…' : 'Dismiss'}</button>
                <button className="btn-ghost btn-sm" onClick={() => setConfirmDismiss(false)}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDismiss(true)} className="btn-tool" title="Not relevant: remove it from your dashboard">
                <X size={15} weight="bold" aria-hidden="true" />
                Dismiss
              </button>
            )}

            {headline?.source_url && (
              <a href={headline.source_url} className="btn-primary sm:ml-auto" target="_blank" rel="noreferrer">
                <ArrowSquareOut size={16} weight="bold" aria-hidden="true" />
                View Official Source
              </a>
            )}
          </div>

          {/* Dispute drawer */}
          {disputeOpen && (
            <div className="mt-4 p-5 space-y-4" style={{ borderRadius: 'var(--r-tile)', background: 'rgb(var(--surface-rgb) / 0.70)', border: '1px solid rgb(var(--line-rgb) / 0.45)' }}>
              {disputeResult ? (
                <div className="space-y-3" role="status">
                  <div className="text-sm font-semibold" style={{ color: disputeResult.relevant ? 'var(--primary)' : 'var(--warning)' }}>
                    {disputeResult.relevant ? 'Re-checked: still considered relevant.' : 'Re-checked: no longer considered relevant.'}
                  </div>
                  {disputeResult.verdicts && disputeResult.verdicts.length > 1 ? (
                    <ul className="space-y-2">
                      {disputeResult.verdicts.map((v, i) => (
                        <li key={`${v.entity}-${i}`} className="text-sm" style={{ color: 'var(--text-600)', lineHeight: 1.6 }}>
                          <span className="font-semibold">{v.entity}</span>
                          <span style={{ color: v.relevant ? 'var(--primary)' : 'var(--warning)' }}>{v.relevant ? ' · relevant' : ' · not relevant'}</span>
                          {': '}{v.reason}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm" style={{ color: 'var(--text-600)', lineHeight: 1.6 }}>{disputeResult.reason}</p>
                  )}
                  {!disputeResult.relevant && (
                    <p className="text-[13px]" style={{ color: 'var(--text-400)' }}>This will stop appearing on your dashboard the next time it loads.</p>
                  )}
                </div>
              ) : (
                <>
                  <label htmlFor="dispute-note" className="block text-[13px]" style={{ color: 'var(--text-500)', lineHeight: 1.6 }}>
                    RegWay AI will re-check this match against your firm, fund, and company profiles as they stand right now. If a profile fact was wrong, correct it in Settings first, or describe what's off below and submit anyway.
                  </label>
                  <textarea
                    id="dispute-note"
                    name="dispute-note"
                    className="glass-input-rect resize-y"
                    style={{ lineHeight: 1.6, minHeight: 80 }}
                    placeholder={`Optional: what's wrong with this match? (e.g. "we don't actually operate in Texas")`}
                    value={disputeNote}
                    onChange={e => setDisputeNote(e.target.value)}
                    disabled={disputing}
                  />
                  {disputeError && <p className="text-[13px]" role="alert" style={{ color: 'var(--warning)' }}>{disputeError}</p>}
                  <div className="flex justify-end">
                    <button className="btn-primary btn-sm" onClick={submitDispute} disabled={disputing}>
                      {disputing ? 'Re-checking…' : 'Re-check this match'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Notes drawer */}
          {noteOpen && (
            <div className="mt-4 p-5 space-y-4" style={{ borderRadius: 'var(--r-tile)', background: 'rgb(var(--surface-rgb) / 0.70)', border: '1px solid rgb(var(--line-rgb) / 0.45)' }}>
              {notes.map(n => (
                <div key={n.id} className="pb-3" style={{ borderBottom: '1px solid rgb(var(--line-rgb) / 0.30)' }}>
                  <div className="text-xs font-medium mb-1 num" style={{ color: 'var(--text-400)' }}>
                    {new Date(n.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                  <div className="text-sm whitespace-pre-line break-words" style={{ color: 'var(--text-900)', lineHeight: 1.6 }}>{n.body}</div>
                </div>
              ))}
              <div>
                <textarea
                  name="note"
                  aria-label="New note"
                  className="glass-input-rect resize-y"
                  style={{ lineHeight: 1.6, minHeight: 88 }}
                  placeholder="Log a firm-specific observation tied to this regulation…"
                  value={noteDraft}
                  onChange={e => setNoteDraft(e.target.value)}
                />
                <div className="flex justify-end mt-3">
                  <button className="btn-primary btn-sm" onClick={saveNote} disabled={!noteDraft.trim()}>
                    Save Note
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main deep-dive layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 items-start">
          <div className="lg:col-span-2 min-w-0">
            <ImpactPanel
              regulationId={regulationId}
              fallbackSummary={headline?.summary}
              focusEntityName={focusEntity}
              focusToken={focusToken}
              refreshToken={refreshToken}
              scheduledPublication={prePublication ? headline?.published_date : null}
            />
          </div>

          {/* Sidebar: one card, three blocks */}
          <aside className="glass-card p-6 space-y-7 lg:sticky lg:top-24 min-w-0">
            {headline?.source_url && (
              <div>
                <h2 className="section-label mb-3">Primary source</h2>
                <a
                  href={headline.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block p-4 transition-[background-color,border-color] duration-200 hover:bg-[rgb(var(--primary-rgb)/0.1)]"
                  style={{ borderRadius: 'var(--r-tile)', background: 'rgb(var(--primary-rgb) / 0.06)', border: '1px solid rgb(var(--primary-rgb) / 0.16)' }}
                >
                  {sourceDomain(headline.source_url) && (
                    <div className="text-xs font-medium mb-1" style={{ color: 'var(--primary)' }}>{sourceDomain(headline.source_url)}</div>
                  )}
                  <div className="text-sm font-semibold break-words" style={{ color: 'var(--text-900)', lineHeight: 1.4 }}>
                    {title}
                  </div>
                  <div className="flex items-center gap-1 mt-3 text-[13px] font-medium" style={{ color: 'var(--primary)' }}>
                    View source
                    <ArrowUpRight size={13} weight="bold" aria-hidden="true" />
                  </div>
                </a>
              </div>
            )}

            {versions.length > 0 && (
              <div>
                <h2 className="section-label mb-3">Also published as</h2>
                <div className="space-y-2.5">
                  {versions.map(v => (
                    <a
                      key={v.id}
                      href={v.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="block p-4 transition-colors duration-200 hover:bg-[var(--hover-tint)]"
                      style={{ borderRadius: 'var(--r-tile)', background: 'rgb(var(--surface-rgb) / 0.60)', border: '1px solid rgb(var(--line-rgb) / 0.45)' }}
                    >
                      <div className="text-xs font-medium mb-1" style={{ color: 'var(--primary)' }}>
                        {publisherName(v)}
                        {formatDate(v.published_date) && <span className="num" style={{ color: 'var(--text-400)' }}> · {formatDate(v.published_date)}</span>}
                      </div>
                      <div className="text-sm break-words" style={{ color: 'var(--text-900)', lineHeight: 1.4 }}>{v.title}</div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {facts.length > 0 && (
              <div>
                <h2 className="section-label mb-3">Details</h2>
                <dl className="space-y-2.5">
                  {facts.map(item => (
                    <div key={item.label} className="flex justify-between text-[13px] gap-4">
                      <dt style={{ color: 'var(--text-400)' }}>{item.label}</dt>
                      <dd className="font-medium text-right num break-words min-w-0" style={{ color: 'var(--text-600)' }}>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </aside>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
