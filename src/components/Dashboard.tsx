import { useEffect, useRef, useState } from 'react'
import { useCachedState } from '../lib/useCachedState'
import { isScanning, needsScan, onScanChange, prewarmCompanies } from '../lib/scans'
import { patchCache, writeCache } from '../lib/cache'
import { supabase } from '../lib/supabase'
import { fetchFirmRegulations, fetchPortfolioCompanies, fetchFunds, dismissRegulation, getCachedCompanies, getFirmId, fetchFailingSources, fetchImpactStatuses, matchGeopoliticalDevelopments, subscribeToMatches } from '../lib/data'
import type { MatchedRegulation, PortfolioCompany, Fund, Firm } from '../lib/types'
import { DEFAULT_FILTER, type FeedFilter } from '../lib/feedFilter'
import type { DaySelection } from '../lib/feedDays'
import { markVisit } from '../lib/lastVisit'
import PageHeader from './PageHeader'
import SiteFooter from './SiteFooter'
import ThemeToggle from './ThemeToggle'
import EntityFeed from './EntityFeed'
import AiAskBar from './AiAskBar'
import { dayKey, type EntityRef } from './EntityPage'
import ProfileReminder from './ProfileReminder'
import { useProfileCompletion } from '../lib/useProfileCompletion'

type View = 'onboarding' | 'dashboard' | 'detail' | 'profile' | 'ai' | 'entity'

interface DashboardProps {
  onNavigate: (view: View, payload?: unknown) => void
}

function EmptyState({ message }: { message: string }) {
  return <div className="empty-state">{message}</div>
}

type Toggle = 'pe' | 'fund' | 'portfolio'

function greeting(now = new Date()) {
  const hour = now.getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [firmId, setFirmId] = useCachedState<string | null>('firmId', null)
  const [firm, setFirm] = useCachedState<Firm | null>('firm', null)
  const [companies, setCompanies] = useCachedState<PortfolioCompany[]>('companies', [])
  const [funds, setFunds] = useCachedState<Fund[]>('funds', [])
  // Which tab is open survives navigating to a headline or an entity page and back.
  const [activeToggle, setActiveToggle] = useCachedState<Toggle | null>('ui:activeToggle', null)

  const [peRegs, setPeRegs] = useCachedState<MatchedRegulation[] | null>('regs:pe', null)
  // The day the PE Firm list shows (null = today); funds and companies
  // have their own pages (EntityPage).
  const [peDay, setPeDay] = useCachedState<DaySelection>(dayKey({ type: 'firm' }), null)
  // Category/topic/date/location filter for whichever entity list is open;
  // kept across entities and navigation, like the open tab.
  const [feedFilter, setFeedFilter] = useCachedState<FeedFilter>('ui:feedFilter', DEFAULT_FILTER)
  // Matches newer than this are badged "New" (see lib/lastVisit).
  const [newSince, setNewSince] = useState<string | null>(null)
  // regulation_id -> the AI-written status sentence, for the "Proposed"/"Final"
  // badge on list items (regulatory category only — see StatusBadge).
  const [impactStatuses, setImpactStatuses] = useCachedState<Record<string, string>>('regs:impactStatus', {})
  const [, forceRender] = useState(0)

  const completion = useProfileCompletion()

  // Refresh the firm and its companies. Cached values render immediately;
  // this just brings them up to date.
  useEffect(() => {
    getFirmId()
      .then(async id => {
        if (!id) return
        setFirmId(id)
        const { data: { session } } = await supabase.auth.getSession()
        if (session) setNewSince(markVisit(session.user.id, id))
        const [{ data: firmRow }, cos, fs] = await Promise.all([
          supabase.from('firms').select('*').eq('id', id).single(),
          fetchPortfolioCompanies(id),
          fetchFunds(id),
        ])
        if (firmRow) setFirm(firmRow)
        setCompanies(cos)
        setFunds(fs)
        // Research every company that needs it now, in the background, so
        // results are already there when a company is opened.
        prewarmCompanies(id, cos)
        // Geopolitical items arrive daily from the syncs; match whatever is
        // new against the firm's locations. A no-op (no AI call) when nothing
        // new touches a country the firm is connected to. Company lists pick
        // new matches up when opened; the firm list is refreshed here.
        matchGeopoliticalDevelopments()
          .then(found => (found > 0 ? fetchFirmRegulations(id).then(setPeRegs) : undefined))
          .catch(() => {})
      })
      .catch(() => {})
  }, [])

  // Scans finish in the background (possibly while on another screen): pick
  // up their results from the cache and re-render "researching" indicators.
  useEffect(
    () =>
      onScanChange(() => {
        const cos = getCachedCompanies()
        if (cos) setCompanies(cos)
        forceRender(n => n + 1)
      }),
    [],
  )

  // Refresh the open PE Firm list in the background.
  useEffect(() => {
    if (!firmId) return
    if (activeToggle === 'pe') fetchFirmRegulations(firmId).catch(() => null).then(r => r && setPeRegs(r))
  }, [firmId, activeToggle])

  // The scheduled matcher (run-matching) writes new matches while the
  // dashboard may be open: refresh the PE Firm list when it's showing. A
  // ref, so the subscription isn't torn down on every tab switch.
  const openTab = useRef(activeToggle)
  openTab.current = activeToggle
  useEffect(() => {
    if (!firmId) return
    return subscribeToMatches(firmId, () => {
      if (openTab.current === 'pe') fetchFirmRegulations(firmId).then(setPeRegs).catch(() => {})
    })
  }, [firmId])

  // Fetch the proposed/final status for whichever regulatory items are
  // currently visible, so the list badge doesn't require opening the item.
  useEffect(() => {
    if (!firmId) return
    const visible = activeToggle === 'pe' ? peRegs ?? [] : []
    const ids = visible.filter(r => r.category === 'regulatory').map(r => r.id)
    if (ids.length === 0) return
    fetchImpactStatuses(firmId, ids)
      .then(statuses => setImpactStatuses(prev => ({ ...prev, ...statuses })))
      .catch(() => {})
  }, [firmId, activeToggle, peRegs])

  // Platform-wide, not per-firm — so a quiet dashboard reads as a stated
  // data-source limitation rather than silently implying nothing is relevant.
  const [failingSources, setFailingSources] = useState<string[]>([])
  useEffect(() => {
    fetchFailingSources().then(setFailingSources).catch(() => {})
  }, [])

  const dismiss = (regulationId: string) => {
    if (!firmId) return
    dismissRegulation(firmId, regulationId)
      .then(() => {
        const without = (list: MatchedRegulation[] | null) => list && list.filter(r => r.id !== regulationId)
        setPeRegs(without)
        // The same item can be listed on a fund's or a company's page too.
        const drop = (prev: Record<string, MatchedRegulation[]> = {}) => Object.fromEntries(Object.entries(prev).map(([id, list]) => [id, list.filter(r => r.id !== regulationId)]))
        patchCache('regs:fund', drop)
        patchCache('regs:company', drop)
      })
      .catch(() => {})
  }

  // Shared by the firm, fund and company lists (same layout on all three).
  const feedProps = {
    statuses: impactStatuses,
    newSince,
    filter: feedFilter,
    onFilterChange: setFeedFilter,
    firmCreatedAt: firm?.created_at,
    onOpen: (r: MatchedRegulation) => onNavigate('detail', r),
    onDismiss: dismiss,
  }

  const toggles: { key: Toggle; label: string }[] = [
    { key: 'pe', label: 'PE Firm' },
    { key: 'fund', label: 'Fund Structure' },
    { key: 'portfolio', label: 'Portfolio Companies' },
  ]

  const selectToggle = (key: Toggle) => {
    // Opening the PE Firm list starts on today.
    if (key === 'pe' && activeToggle !== 'pe') setPeDay(null)
    setActiveToggle(activeToggle === key ? null : key)
  }

  // A fund or company opens its own page, on today's findings.
  const openEntity = (ref: EntityRef) => {
    writeCache(dayKey(ref), null)
    onNavigate('entity', ref)
  }

  const firstName = firm?.lead_gp_name?.split(' ')[0] || 'there'
  const initials = (firm?.lead_gp_name || 'GP')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const tabCounts: Record<Toggle, number | null> = { pe: null, fund: funds.length || null, portfolio: companies.length || null }

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <a href="#main" className="skip-link">Skip to content</a>
      <PageHeader width="max-w-[1200px]">
        <ThemeToggle />
        {/* Avatar: click for Profile */}
        <button
          className="relative w-9 h-9 flex items-center justify-center text-[13px] font-semibold text-white rounded-full transition-transform active:scale-95"
          style={{ background: 'var(--brand)' }}
          title="Profile"
          aria-label="Profile"
          onClick={() => onNavigate('profile')}
        >
          {initials}
          {completion.ready && completion.incomplete.length > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
              style={{ background: 'var(--brand)', boxShadow: '0 0 0 2px var(--canvas)' }}
              title="Profile incomplete"
            />
          )}
        </button>
      </PageHeader>

      {/* With no level open the page is a greeting, three choices and the
          AI bar: that sits in the middle of the window (a little above
          true centre, which reads as centred). An open list starts at the top. */}
      <main id="main" className={`flex-1 w-full max-w-[1200px] mx-auto px-5 sm:px-8 flex flex-col ${activeToggle ? 'pt-10 sm:pt-14 pb-16' : 'justify-center pt-10 pb-[14vh]'}`}>
        <div className="w-full max-w-2xl mx-auto">
          <div className="mb-10 text-center">
            <h1 className="text-[30px] sm:text-[36px] font-semibold" style={{ color: 'var(--text-900)', letterSpacing: '-0.035em', lineHeight: 1.15 }}>
              {greeting()}, {firstName}.
            </h1>
            <p className="text-base mt-3" style={{ color: 'var(--text-400)' }}>
              {firm ? `Here's what's moving across ${firm.name} today.` : "Here's what's moving across your firm today."}
            </p>
          </div>

          {failingSources.length > 0 && (
            <div className="notice mb-8" role="status">
              {failingSources.length === 1
                ? `${failingSources[0]} hasn't updated successfully recently. Recent items from this source may be missing.`
                : `${failingSources.join(', ')} haven't updated successfully recently. Recent items from these sources may be missing.`}
            </div>
          )}

          <ProfileReminder completion={completion} onOpen={(tab, focusId) => onNavigate('profile', { tab, focusId })} />

          {/* The three levels of the firm. Pressing the open one closes it. */}
          <div className="grid grid-cols-3 gap-1 p-1" style={{ borderRadius: 'var(--r-card)', background: 'rgb(var(--surface-rgb) / 0.6)', border: '1px solid rgb(var(--line-strong-rgb) / 0.5)', boxShadow: 'var(--shadow-card)' }}>
            {toggles.map(t => {
              const active = activeToggle === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => selectToggle(t.key)}
                  aria-pressed={active}
                  className="level-tab"
                >
                  {t.label}
                  {tabCounts[t.key] !== null && <span className="level-count num" aria-hidden="true">{tabCounts[t.key]}</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* State-driven content */}
        <div style={{ marginTop: activeToggle ? 32 : 0, marginBottom: activeToggle ? 48 : 0 }}>
          {activeToggle === 'pe' && (
            <EntityFeed
              items={peRegs ?? undefined}
              loadingMessage="Loading developments matched to your firm…"
              emptyMessage="No developments have been confirmed relevant to your firm yet."
              day={peDay}
              onDayChange={setPeDay}
              {...feedProps}
            />
          )}

          {activeToggle === 'fund' && (
            funds.length === 0 ? (
              <EmptyState message="No funds on file yet." />
            ) : (
              <div className="max-w-2xl mx-auto grid grid-cols-2 sm:grid-cols-3 gap-4">
                {funds.map(f => (
                  <button key={f.id} onClick={() => openEntity({ type: 'fund', id: f.id })} className="glass-card-light glass-lift text-left p-5 min-w-0">
                    <div className="tile w-11 h-11 text-sm mb-4" aria-hidden="true">
                      {f.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="text-sm font-semibold break-words" style={{ color: 'var(--text-900)' }}>{f.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-400)' }}>{f.structure ?? 'Structure n/a'}</div>
                  </button>
                ))}
              </div>
            )
          )}

          {activeToggle === 'portfolio' && (
            companies.length === 0 ? (
              <EmptyState message="No portfolio companies on file yet." />
            ) : (
              <div className="max-w-2xl mx-auto grid grid-cols-2 sm:grid-cols-3 gap-4">
                {companies.map(co => (
                  <button key={co.id} onClick={() => openEntity({ type: 'company', id: co.id })} className="glass-card-light glass-lift text-left p-5 min-w-0">
                    <div className="tile w-11 h-11 text-sm mb-4" style={co.logo_url ? { background: 'none' } : undefined} aria-hidden="true">
                      {co.logo_url ? (
                        <img src={co.logo_url} alt="" width={44} height={44} loading="lazy" className="w-full h-full block object-cover" />
                      ) : (
                        co.name.split(' ').map(w => w[0]).join('').slice(0, 2)
                      )}
                    </div>
                    <div className="text-sm font-semibold break-words" style={{ color: 'var(--text-900)' }}>{co.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-400)' }}>{(co.sectors ?? []).join(', ')}</div>
                    {(isScanning(co.id) || needsScan(co)) && (
                      <div className="flex items-center gap-1.5 mt-3 text-xs font-medium" style={{ color: 'var(--primary)' }}>
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--primary-light)' }} />
                        Researching…
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )
          )}
        </div>

        {/* RegWay AI, firm-wide (funds and companies have their own, on their pages). */}
        <AiAskBar
          placeholder="Ask RegWay AI about today's regulatory impact on your firm…"
          onOpen={() => onNavigate('ai')}
          style={{ marginTop: activeToggle ? 0 : 20, width: '100%' }}
        />
      </main>

      <SiteFooter />
    </div>
  )
}
