import { useEffect, useRef, useState } from 'react'
import { useCachedState } from '../lib/useCachedState'
import { isScanning, needsScan, onScanChange, scanCompany } from '../lib/scans'
import { readCache } from '../lib/cache'
import { supabase } from '../lib/supabase'
import { dismissRegulation, fetchCompanyRegulations, fetchFundRegulations, fetchHoldings, fetchImpactStatuses, getFirmId, subscribeToMatches } from '../lib/data'
import type { AiContext, Firm, Fund, FundHolding, MatchedRegulation, PortfolioCompany } from '../lib/types'
import { DEFAULT_FILTER, type FeedFilter } from '../lib/feedFilter'
import type { DaySelection } from '../lib/feedDays'
import { markVisit } from '../lib/lastVisit'
import EntityFeed from './EntityFeed'
import AiAskBar from './AiAskBar'
import PageHeader from './PageHeader'

// One fund's or one portfolio company's own page (roadmap item 9): who it is,
// how it connects to the rest of the portfolio, every development RegWay has
// matched to it (day by day, today first), and RegWay AI scoped to it.
// The PE firm itself stays on the dashboard.

export interface EntityRef {
  type: 'fund' | 'company'
  id: string
}

// The day each entity page is showing, kept while a development is opened
// and closed again (memory-only `ui:` cache); opening the page from the
// dashboard starts it on today (see Dashboard).
export const dayKey = (ref: EntityRef | { type: 'firm' }) => (ref.type === 'firm' ? 'ui:day:firm' : `ui:day:${ref.type}:${ref.id}`)

type Navigate = (view: 'dashboard' | 'detail' | 'profile' | 'ai', payload?: unknown) => void

const initialsOf = (name: string) =>
  name
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

export default function EntityPage({ entity, onNavigate }: { entity: EntityRef; onNavigate: Navigate }) {
  const [firmId, setFirmId] = useCachedState<string | null>('firmId', null)
  const [firm] = useCachedState<Firm | null>('firm', null)
  const [funds] = useCachedState<Fund[]>('funds', [])
  const [companies] = useCachedState<PortfolioCompany[]>('companies', [])
  const [fundRegs, setFundRegs] = useCachedState<Record<string, MatchedRegulation[]>>('regs:fund', {})
  const [companyRegs, setCompanyRegs] = useCachedState<Record<string, MatchedRegulation[]>>('regs:company', {})
  const [impactStatuses, setImpactStatuses] = useCachedState<Record<string, string>>('regs:impactStatus', {})
  const [feedFilter, setFeedFilter] = useCachedState<FeedFilter>('ui:feedFilter', DEFAULT_FILTER)
  const [day, setDay] = useCachedState<DaySelection>(dayKey(entity), null)
  const [holdings, setHoldings] = useState<FundHolding[] | null>(null)
  const [newSince, setNewSince] = useState<string | null>(null)
  const [, forceRender] = useState(0)

  const isFund = entity.type === 'fund'
  const fund = isFund ? funds.find(f => f.id === entity.id) : undefined
  const company = isFund ? undefined : companies.find(c => c.id === entity.id)
  const name = fund?.name ?? company?.name ?? ''
  const items = isFund ? fundRegs[entity.id] : companyRegs[entity.id]
  const scanning = !isFund && isScanning(entity.id)

  const setItems = (regs: MatchedRegulation[]) =>
    isFund ? setFundRegs(prev => ({ ...prev, [entity.id]: regs })) : setCompanyRegs(prev => ({ ...prev, [entity.id]: regs }))
  const load = (id: string) => (isFund ? fetchFundRegulations(id, entity.id) : fetchCompanyRegulations(id, entity.id))

  // The list, the holdings, and the "New since last visit" cut-off. A
  // company that still needs researching starts (or joins) its scan; the
  // result arrives through the scan listener below.
  useEffect(() => {
    getFirmId()
      .then(async id => {
        if (!id) return
        setFirmId(id)
        const { data: { session } } = await supabase.auth.getSession()
        if (session) setNewSince(markVisit(session.user.id, id))
        fetchHoldings(id).then(setHoldings).catch(() => setHoldings([]))
        if (company && needsScan(company) && !isScanning(entity.id)) {
          scanCompany(id, entity.id).catch(() => {})
          return
        }
        if (!isScanning(entity.id)) load(id).then(setItems).catch(() => {})
      })
      .catch(() => {})
  }, [entity.type, entity.id])

  useEffect(
    () =>
      onScanChange(() => {
        const regs = readCache<Record<string, MatchedRegulation[]>>('regs:company')
        if (regs) setCompanyRegs(regs)
        forceRender(n => n + 1)
      }),
    [],
  )

  // New matches written while the page is open (scheduled matching).
  const current = useRef(entity)
  current.current = entity
  useEffect(() => {
    if (!firmId) return
    return subscribeToMatches(firmId, () => {
      if (current.current.type === 'company' && isScanning(current.current.id)) return
      load(firmId).then(setItems).catch(() => {})
    })
  }, [firmId, entity.type, entity.id])

  // Proposed/final badges for the regulatory items listed.
  useEffect(() => {
    if (!firmId || !items) return
    const ids = items.filter(r => r.category === 'regulatory').map(r => r.id)
    if (ids.length === 0) return
    fetchImpactStatuses(firmId, ids)
      .then(statuses => setImpactStatuses(prev => ({ ...prev, ...statuses })))
      .catch(() => {})
  }, [firmId, items])

  const dismiss = (regulationId: string) => {
    if (!firmId) return
    dismissRegulation(firmId, regulationId)
      .then(() => {
        const drop = (prev: Record<string, MatchedRegulation[]>) => Object.fromEntries(Object.entries(prev).map(([id, list]) => [id, list.filter(r => r.id !== regulationId)]))
        setFundRegs(drop)
        setCompanyRegs(drop)
      })
      .catch(() => {})
  }

  // How this entity connects to the rest of the portfolio (fund_holdings).
  const related = holdings === null
    ? null
    : isFund
      ? holdings.filter(h => h.fund_id === entity.id).map(h => companies.find(c => c.id === h.portfolio_company_id)?.name).filter((n): n is string => !!n)
      : holdings.filter(h => h.portfolio_company_id === entity.id).map(h => funds.find(f => f.id === h.fund_id)?.name).filter((n): n is string => !!n)

  const aiContext: AiContext | undefined = name ? { type: entity.type, id: entity.id, name } : undefined
  const subtitle = fund
    ? [fund.structure, fund.size, (fund.jurisdictions ?? []).join(', ')].filter(Boolean).join(' · ')
    : company
      ? [(company.sectors ?? []).join(', '), company.hq_location].filter(Boolean).join(' · ')
      : ''

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <a href="#main" className="skip-link">Skip to content</a>
      <PageHeader back={{ label: 'Dashboard', onClick: () => onNavigate('dashboard') }} />

      <main id="main" className="flex-1 w-full max-w-[1200px] mx-auto px-5 sm:px-8 pt-10 sm:pt-12 pb-16">
        {!name ? (
          <div className="empty-state">
            This {isFund ? 'fund' : 'company'} isn't on file any more.
          </div>
        ) : (
          <>
            <div className="max-w-2xl mx-auto flex items-start gap-4 mb-10">
              <div className="tile w-14 h-14 text-base" style={company?.logo_url ? { background: 'none', borderRadius: 14 } : { borderRadius: 14 }} aria-hidden="true">
                {company?.logo_url ? <img src={company.logo_url} alt="" width={56} height={56} className="w-full h-full block object-cover" /> : initialsOf(name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium" style={{ color: 'var(--primary)' }}>{isFund ? 'Fund' : 'Portfolio company'}</div>
                <h1 className="text-[28px] font-semibold break-words" style={{ color: 'var(--text-900)', letterSpacing: '-0.035em', lineHeight: 1.15 }}>{name}</h1>
                {subtitle && <div className="text-[15px] mt-1" style={{ color: 'var(--text-400)' }}>{subtitle}</div>}
                <div className="text-[13px] mt-2" style={{ color: 'var(--text-600)' }}>
                  {related === null
                    ? ' '
                    : related.length
                      ? `${isFund ? 'Holds' : 'Held by'}: ${related.join(', ')}`
                      : isFund
                        ? 'Portfolio companies held: not recorded'
                        : 'Held by: not recorded'}
                </div>
              </div>
              <button onClick={() => onNavigate('profile', { tab: isFund ? 'funds' : 'portfolio', focusId: entity.id })} className="link text-[13px] flex-shrink-0 mt-1">
                Edit profile
              </button>
            </div>

            <div className="mb-12">
              {scanning ? (
                <div className="empty-state" role="status">
                  <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse mr-2 align-middle" style={{ background: 'var(--primary-light)' }} aria-hidden="true" />
                  RegWay AI is researching regulations for this company. This can take a minute the first time, and the results are saved.
                </div>
              ) : (
                <EntityFeed
                  items={items}
                  loadingMessage="Loading…"
                  emptyMessage={isFund ? 'No developments have been confirmed relevant to this fund yet.' : 'No developments found that affect this company right now.'}
                  statuses={impactStatuses}
                  newSince={newSince}
                  filter={feedFilter}
                  onFilterChange={setFeedFilter}
                  day={day}
                  onDayChange={setDay}
                  firmCreatedAt={firm?.created_at}
                  onOpen={r => onNavigate('detail', r)}
                  onDismiss={dismiss}
                />
              )}
            </div>

            <AiAskBar placeholder={`Ask RegWay AI about ${name}…`} onOpen={() => onNavigate('ai', aiContext)} />
          </>
        )}
      </main>
    </div>
  )
}
