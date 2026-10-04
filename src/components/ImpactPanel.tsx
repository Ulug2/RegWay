import { useEffect, useRef, useState } from 'react'
import { fetchImpact, getCachedImpact, requestImpact } from '../lib/data'
import type { ImpactContent, ImpactEntity } from '../lib/types'

type PanelView = 'summary' | 'cards'

const TYPE_LABEL: Record<ImpactEntity['entity_type'], string> = { firm: 'Firm', fund: 'Fund', company: 'Portfolio company' }

const paragraphs = (text: string) => text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#64748B' }}>{children}</div>
  )
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm" style={{ color: '#334155', lineHeight: 1.7 }}>
          <span className="mt-2.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#38BDF8' }} />
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
          <p key={i} className="text-sm" style={{ color: '#334155', lineHeight: 1.8 }}>{p}</p>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="p-5 rounded-xl" style={{ background: 'rgba(2,132,199,0.05)', border: '1px solid rgba(2,132,199,0.12)' }}>
          <Label>Scope</Label>
          <div className="space-y-2">
            {paragraphs(impact.scope).map((p, i) => <p key={i} className="text-sm" style={{ color: '#334155', lineHeight: 1.7 }}>{p}</p>)}
          </div>
        </div>
        <div className="p-5 rounded-xl" style={{ background: 'rgba(2,132,199,0.05)', border: '1px solid rgba(2,132,199,0.12)' }}>
          <Label>Status</Label>
          <p className="text-sm" style={{ color: '#334155', lineHeight: 1.7 }}>{impact.status}</p>
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
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(186,230,253,0.45)' }}>
            {impact.key_dates.map((d, i) => (
              <div
                key={i}
                className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[200px_160px_minmax(0,1fr)] gap-x-4 gap-y-1 px-4 py-3 text-sm"
                style={{ background: i % 2 ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.75)', borderTop: i ? '1px solid rgba(186,230,253,0.30)' : 'none' }}
              >
                <span className="font-medium" style={{ color: '#0F172A' }}>{d.label}</span>
                <span style={{ color: '#0284C7' }}>{d.date}</span>
                <span className="col-span-2 md:col-span-1" style={{ color: '#64748B' }}>{d.note}</span>
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
              <div key={i} className="text-sm" style={{ color: '#334155', lineHeight: 1.7 }}>
                <span className="font-semibold" style={{ color: '#0F172A' }}>{e.entity_name}</span>
                <span style={{ color: '#94a3b8' }}> · {TYPE_LABEL[e.entity_type]} — </span>
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

      <p className="text-xs pt-4" style={{ color: '#94a3b8', lineHeight: 1.7, borderTop: '1px solid rgba(186,230,253,0.30)' }}>
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
      className="glass-card-light overflow-hidden transition-all"
      style={{ boxShadow: open ? 'inset 0 0 0 1.5px rgba(56,189,248,0.45), 0 8px 24px rgba(2,132,199,0.10)' : undefined }}
    >
      <button className="w-full text-left flex items-start gap-4 p-5" onClick={onToggle}>
        <div
          className="w-10 h-10 shrink-0 flex items-center justify-center text-sm font-bold"
          style={{ background: 'rgba(224,242,254,0.85)', color: '#0284C7', borderRadius: 12 }}
        >
          {entity.entity_name.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>{entity.entity_name}</span>
            <span className="text-[10px] font-medium px-2 py-0.5" style={{ borderRadius: 9999, background: 'rgba(2,132,199,0.08)', color: '#0284C7' }}>
              {TYPE_LABEL[entity.entity_type]}
            </span>
          </div>
          <p className="text-sm" style={{ color: '#475569', lineHeight: 1.6 }}>{entity.headline}</p>
        </div>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-1 shrink-0" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s', color: '#94a3b8' }}>
          <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-6 space-y-6" style={{ borderTop: '1px solid rgba(186,230,253,0.30)', paddingTop: 20 }}>
          <div>
            <Label>How it applies</Label>
            <div className="space-y-3">
              {paragraphs(entity.how_it_applies).map((p, i) => <p key={i} className="text-sm" style={{ color: '#334155', lineHeight: 1.75 }}>{p}</p>)}
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
              <p className="text-sm" style={{ color: '#334155', lineHeight: 1.7 }}>{entity.timeline}</p>
            </div>
          )}
          {entity.operational_areas.length > 0 && (
            <div>
              <Label>Areas touched</Label>
              <div className="flex flex-wrap gap-2">
                {entity.operational_areas.map(a => (
                  <span key={a} className="text-xs font-medium px-3 py-1" style={{ borderRadius: 9999, background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(148,197,224,0.55)', color: '#334155' }}>{a}</span>
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
    <div className="glass-card" style={{ padding: 32 }}>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <h2 className="text-lg font-semibold" style={{ color: '#0F172A' }}>Context & Overview</h2>
        <div className="flex items-center gap-1 p-1" style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(186,230,253,0.45)', borderRadius: 9999 }}>
          {([['summary', 'Summary'], ['cards', 'Impact Cards']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className="px-4 py-1.5 text-xs font-medium rounded-full transition-all"
              style={{ background: view === key ? 'linear-gradient(135deg,#0284C7,#38BDF8)' : 'transparent', color: view === key ? 'white' : '#64748B' }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!impact ? (
        <div className="space-y-4">
          {state === 'loading' && (
            <div className="flex items-center gap-2 text-xs" style={{ color: '#0284C7' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#38BDF8' }} />
              Preparing a detailed analysis for your firm — this can take up to a minute the first time.
            </div>
          )}
          {state === 'awaiting' && (
            <div className="text-xs" style={{ color: '#64748B', lineHeight: 1.6 }}>
              This document is on Federal Register public inspection
              {scheduledPublication ? `, scheduled for publication on ${new Date(scheduledPublication + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}.
              The detailed analysis will be written from its full text once it's published.
            </div>
          )}
          {state === 'error' && (
            <div className="text-xs" style={{ color: '#64748B' }}>
              The detailed analysis couldn't be prepared right now.{' '}
              <button className="underline" style={{ color: '#0284C7' }} onClick={() => { setState('loading'); setAttempt(a => a + 1) }}>Try again</button>
            </div>
          )}
          <p className="text-sm" style={{ color: fallbackSummary ? '#334155' : '#94a3b8', lineHeight: 1.75 }}>
            {fallbackSummary || 'No summary is available for this item yet.'}
          </p>
        </div>
      ) : view === 'summary' ? (
        <SummaryView impact={impact} />
      ) : impact.impacts.length === 0 ? (
        <p className="text-sm" style={{ color: '#94a3b8' }}>This regulation does not map to a specific entity in your firm.</p>
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
