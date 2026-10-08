import { useEffect, useRef, useState } from 'react'
import { fetchImpact, getCachedImpact, requestImpact } from '../lib/data'
import type { ImpactContent, ImpactEntity } from '../lib/types'
import { CaretDown } from './icons'

type PanelView = 'summary' | 'cards'

const TYPE_LABEL: Record<ImpactEntity['entity_type'], string> = { firm: 'Firm', fund: 'Fund', company: 'Portfolio company' }

// The analysis gives dates as text; one that is a plain ISO day reads as a date.
const displayDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : value

const paragraphs = (text: string) => text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="section-label mb-2.5">{children}</h3>
  )
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-[15px]" style={{ color: 'var(--text-600)', lineHeight: 1.65 }}>
          <span className="mt-[10px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--primary-light)' }} aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function SummaryView({ impact }: { impact: ImpactContent }) {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        {paragraphs(impact.overview).map((p, i) => (
          <p key={i} className="text-base" style={{ color: 'var(--text-600)', lineHeight: 1.7, maxWidth: '68ch' }}>{p}</p>
        ))}
      </div>

      {/* Two facts side by side: no boxes, a rule above each. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        <div className="pt-4" style={{ borderTop: '2px solid rgb(var(--primary-rgb) / 0.35)' }}>
          <Label>Scope</Label>
          <div className="space-y-2">
            {paragraphs(impact.scope).map((p, i) => <p key={i} className="text-[15px]" style={{ color: 'var(--text-600)', lineHeight: 1.65 }}>{p}</p>)}
          </div>
        </div>
        <div className="pt-4" style={{ borderTop: '2px solid rgb(var(--primary-rgb) / 0.35)' }}>
          <Label>Status</Label>
          <p className="text-[15px]" style={{ color: 'var(--text-600)', lineHeight: 1.65 }}>{impact.status}</p>
        </div>
      </div>

      {impact.key_provisions.length > 0 && (
        <div>
          <Label>Key provisions</Label>
          <Bullets items={impact.key_provisions} />
        </div>
      )}

      {impact.key_dates.length > 0 && (
        <div>
          <Label>Key dates</Label>
          <div className="overflow-hidden" style={{ borderRadius: 'var(--r-tile)', border: '1px solid rgb(var(--line-rgb) / 0.45)' }}>
            {impact.key_dates.map((d, i) => (
              <div
                key={i}
                className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[150px_minmax(0,220px)_minmax(0,1fr)] gap-x-5 gap-y-1 px-4 py-3 text-sm"
                style={{ background: 'rgb(var(--surface-rgb) / 0.6)', borderTop: i ? '1px solid rgb(var(--line-rgb) / 0.30)' : 'none' }}
              >
                <span className="mono font-medium md:order-first order-2 text-right md:text-left" style={{ color: 'var(--primary)' }}>{displayDate(d.date)}</span>
                <span className="font-medium" style={{ color: 'var(--text-900)' }}>{d.label}</span>
                <span className="col-span-2 md:col-span-1 order-3" style={{ color: 'var(--text-400)' }}>{d.note}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {impact.impacts.length > 0 && (
        <div>
          <Label>How it relates to your firm</Label>
          <div className="space-y-3">
            {impact.impacts.map((e, i) => (
              <div key={i} className="text-[15px]" style={{ color: 'var(--text-600)', lineHeight: 1.65 }}>
                <span className="font-semibold" style={{ color: 'var(--text-900)' }}>{e.entity_name}</span>
                <span style={{ color: 'var(--text-400)' }}> ({TYPE_LABEL[e.entity_type].toLowerCase()}): </span>
                {e.headline}
              </div>
            ))}
          </div>
        </div>
      )}

      {impact.considerations.length > 0 && (
        <div>
          <Label>Points to confirm with counsel</Label>
          <Bullets items={impact.considerations} />
        </div>
      )}

      <p className="text-[13px] pt-4" style={{ color: 'var(--text-400)', lineHeight: 1.65, borderTop: '1px solid rgb(var(--line-rgb) / 0.30)' }}>
        {impact.limitations}{impact.text_truncated ? ' Only the first portion of a long document was analysed.' : ''} This is an informational analysis
        prepared from the regulation text and your RegWay profile. It is not legal advice.
      </p>
    </div>
  )
}

function ImpactCard({ entity, open, onToggle, cardRef }: { entity: ImpactEntity; open: boolean; onToggle: () => void; cardRef?: (el: HTMLDivElement | null) => void }) {
  return (
    <div
      ref={cardRef}
      className="glass-card-light overflow-hidden transition-ui"
      style={{ boxShadow: open ? 'inset 0 0 0 1.5px rgb(var(--primary-light-rgb) / 0.45), 0 8px 24px rgb(var(--primary-rgb) / 0.10)' : undefined }}
    >
      <button className="w-full text-left flex items-start gap-4 p-5" onClick={onToggle} aria-expanded={open}>
        <div className="tile w-10 h-10 text-sm" aria-hidden="true">
          {entity.entity_name.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-900)' }}>{entity.entity_name}</span>
            <span className="badge" style={{ background: 'rgb(var(--primary-rgb) / 0.08)', color: 'var(--primary)' }}>
              {TYPE_LABEL[entity.entity_type]}
            </span>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-500)', lineHeight: 1.6 }}>{entity.headline}</p>
        </div>
        <CaretDown size={16} weight="bold" aria-hidden="true" className="mt-1 shrink-0" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s', color: 'var(--text-400)' }} />
      </button>

      {open && (
        <div className="px-5 pb-6 space-y-6" style={{ borderTop: '1px solid rgb(var(--line-rgb) / 0.30)', paddingTop: 20 }}>
          <div>
            <Label>How it applies</Label>
            <div className="space-y-3">
              {paragraphs(entity.how_it_applies).map((p, i) => <p key={i} className="text-[15px]" style={{ color: 'var(--text-600)', lineHeight: 1.65 }}>{p}</p>)}
            </div>
          </div>
          {entity.obligations.length > 0 && (
            <div>
              <Label>Requirements that would apply</Label>
              <Bullets items={entity.obligations} />
            </div>
          )}
          {entity.timeline && (
            <div>
              <Label>Timeline</Label>
              <p className="text-[15px]" style={{ color: 'var(--text-600)', lineHeight: 1.65 }}>{entity.timeline}</p>
            </div>
          )}
          {entity.operational_areas.length > 0 && (
            <div>
              <Label>Areas touched</Label>
              <div className="flex flex-wrap gap-2">
                {entity.operational_areas.map(a => (
                  <span key={a} className="badge" style={{ padding: '4px 10px', fontSize: 12, fontWeight: 500, background: 'rgb(var(--surface-rgb) / 0.8)', border: '1px solid rgb(var(--line-strong-rgb) / 0.55)', color: 'var(--text-600)' }}>{a}</span>
                ))}
              </div>
            </div>
          )}
          {entity.open_questions.length > 0 && (
            <div>
              <Label>Not yet known</Label>
              <Bullets items={entity.open_questions} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface ImpactPanelProps {
  regulationId?: string
  // The short official abstract, shown while the full analysis is prepared.
  fallbackSummary?: string | null
  // Set (to an ImpactEntity.entity_name) to switch to Impact Cards and open
  // that entity's card — used by the "also relevant to" cross-links above.
  // Bump focusToken to re-trigger the same entity a second time.
  focusEntityName?: string | null
  focusToken?: number
  // Scheduled publication date, for a document still on public inspection:
  // its analysis waits until the full text is published.
  scheduledPublication?: string | null
  // Bump after the backend force-regenerates the analysis (e.g. a rematch
  // or a profile-edit refresh) to pull the new content instead of the
  // cached one.
  refreshToken?: number
}

export default function ImpactPanel({ regulationId, fallbackSummary, focusEntityName, focusToken, refreshToken, scheduledPublication }: ImpactPanelProps) {
  const [view, setView] = useState<PanelView>('summary')
  const [impact, setImpact] = useState<ImpactContent | null>(() => (regulationId ? getCachedImpact(regulationId) ?? null : null))
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'awaiting'>(impact ? 'ready' : 'loading')
  const [attempt, setAttempt] = useState(0)
  const [openEntity, setOpenEntity] = useState<string | null>(null)
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    if (!regulationId) return
    let alive = true
    ;(async () => {
      try {
        // Normally already prepared in the background; generate on demand if not.
        const found = (await fetchImpact(regulationId)) ?? (await requestImpact(regulationId))
        if (!alive) return
        if (!found) {
          setState('awaiting')
          return
        }
        setImpact(found)
        setState('ready')
        setOpenEntity(prev => prev ?? found.impacts[0]?.entity_name ?? null)
      } catch {
        if (alive) setState(s => (impact ? s : 'error'))
      }
    })()
    return () => {
      alive = false
    }
  }, [regulationId, attempt, refreshToken])

  useEffect(() => {
    if (!focusEntityName || !impact) return
    setView('cards')
    setOpenEntity(focusEntityName)
    // Scroll after the cards view has had a chance to render.
    requestAnimationFrame(() => cardRefs.current[focusEntityName]?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }, [focusEntityName, focusToken, impact])

  return (
    <div className="glass-card p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--text-900)', letterSpacing: '-0.02em' }}>Context & Overview</h2>
        <div className="seg">
          {([['summary', 'Summary'], ['cards', 'Impact Cards']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setView(key)} aria-pressed={view === key} className={`seg-item ${view === key ? 'is-on' : ''}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {!impact ? (
        <div className="space-y-4">
          {state === 'loading' && (
            <div role="status">
              <div className="flex items-center gap-2 text-[13px] font-medium mb-4" style={{ color: 'var(--primary)' }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--primary-light)' }} aria-hidden="true" />
                Preparing a detailed analysis for your firm. This can take up to a minute the first time.
              </div>
              <div className="space-y-2.5" aria-hidden="true">
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-11/12" />
                <div className="skeleton h-4 w-2/3" />
              </div>
            </div>
          )}
          {state === 'awaiting' && (
            <div className="notice">
              This document is on Federal Register public inspection
              {scheduledPublication ? `, scheduled for publication on ${new Date(scheduledPublication + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}.
              The detailed analysis will be written from its full text once it's published.
            </div>
          )}
          {state === 'error' && (
            <div className="notice" role="alert">
              The detailed analysis couldn't be prepared right now.{' '}
              <button className="link" onClick={() => { setState('loading'); setAttempt(a => a + 1) }}>Try again</button>
            </div>
          )}
          <p className="text-base" style={{ color: fallbackSummary ? 'var(--text-600)' : 'var(--text-400)', lineHeight: 1.7, maxWidth: '68ch' }}>
            {fallbackSummary || 'No summary is available for this item yet.'}
          </p>
        </div>
      ) : view === 'summary' ? (
        <SummaryView impact={impact} />
      ) : impact.impacts.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-400)' }}>This regulation does not map to a specific entity in your firm.</p>
      ) : (
        <div className="space-y-4">
          {impact.impacts.map(e => (
            <ImpactCard
              key={`${e.entity_type}-${e.entity_name}`}
              entity={e}
              open={openEntity === e.entity_name}
              onToggle={() => setOpenEntity(o => (o === e.entity_name ? null : e.entity_name))}
              cardRef={el => { cardRefs.current[e.entity_name] = el }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
