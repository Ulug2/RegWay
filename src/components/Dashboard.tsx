import { useEffect, useState } from 'react'
import { useCachedState } from '../lib/useCachedState'
import { supabase } from '../lib/supabase'
import { callFunction } from '../lib/functions'
import { fetchFirmRegulations, fetchFundRegulations, fetchCompanyRegulations, fetchPortfolioCompanies, getFirmId } from '../lib/data'
import type { Regulation, PortfolioCompany, Firm } from '../lib/types'
import LogoMark from './LogoMark'
import ProfileReminder from './ProfileReminder'
import { useProfileCompletion } from '../lib/useProfileCompletion'

type View = 'onboarding' | 'dashboard' | 'detail' | 'profile' | 'ai'

interface DashboardProps {
  onNavigate: (view: View, payload?: unknown) => void
}

function formatDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function HeadlineItem({ regulation, onClick }: { regulation: Regulation; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="glass-card-light glass-lift w-full text-left p-6 block"
    >
      <div className="text-sm font-semibold mb-3" style={{ color: '#0F172A', lineHeight: 1.5 }}>
        {regulation.title}
      </div>
      <div className="flex items-center gap-2 text-xs" style={{ color: '#64748B' }}>
        <span>{regulation.jurisdiction || regulation.agency || 'Unknown'}</span>
        <span style={{ color: '#BAE6FD' }}>●</span>
        <span>{formatDate(regulation.effective_date || regulation.published_date)}</span>
      </div>
    </button>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="max-w-2xl mx-auto text-center text-sm" style={{ color: '#94a3b8', padding: '24px 0' }}>
      {message}
    </div>
  )
}

type Toggle = 'pe' | 'fund' | 'portfolio'

// Company scans that are still running, so leaving the dashboard mid-scan and
// coming back doesn't start a second (paid) scan for the same company.
const scansInFlight = new Map<string, Promise<void>>()

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [firmId, setFirmId] = useCachedState<string | null>('firmId', null)
  const [firm, setFirm] = useCachedState<Firm | null>('firm', null)
  const [companies, setCompanies] = useCachedState<PortfolioCompany[]>('companies', [])
  // Which tab/company is open survives navigating to a headline and back.
  const [activeToggle, setActiveToggle] = useCachedState<Toggle | null>('ui:activeToggle', null)
  const [selectedCompany, setSelectedCompany] = useCachedState<string | null>('ui:selectedCompany', null)
  const [aiQuery, setAiQuery] = useState('')

  const [peRegs, setPeRegs] = useCachedState<Regulation[] | null>('regs:pe', null)
  const [fundRegs, setFundRegs] = useCachedState<Regulation[] | null>('regs:fund', null)
  const [companyRegs, setCompanyRegs] = useCachedState<Record<string, Regulation[]>>('regs:company', {})
  const [scanningCompany, setScanningCompany] = useState<string | null>(null)

  const completion = useProfileCompletion()

  const loadingTab = activeToggle === 'pe' ? peRegs === null : activeToggle === 'fund' ? fundRegs === null : false

  // Refresh the firm and its companies. Cached values render immediately;
  // this just brings them up to date.
  useEffect(() => {
    getFirmId()
      .then(async id => {
        if (!id) return
        setFirmId(id)
        const [{ data: firmRow }, cos] = await Promise.all([
          supabase.from('firms').select('*').eq('id', id).single(),
          fetchPortfolioCompanies(id),
        ])
        if (firmRow) setFirm(firmRow)
        setCompanies(cos)
      })
      .catch(() => {})
  }, [])

  // Refresh the open PE Firm / Fund Structure list in the background.
  useEffect(() => {
    if (!firmId) return
    if (activeToggle === 'pe') fetchFirmRegulations(firmId).catch(() => null).then(r => r && setPeRegs(r))
    if (activeToggle === 'fund') fetchFundRegulations(firmId).catch(() => null).then(r => r && setFundRegs(r))
  }, [firmId, activeToggle])

  // Refresh the open company's regulations. Only if nothing has ever been
  // stored for it do we run the on-demand AI web-search scan (slow, rate
  // limited and paid) — a cached empty result means a scan already found nothing.
  useEffect(() => {
    if (!firmId || activeToggle !== 'portfolio' || !selectedCompany) return
    const id = selectedCompany
    const neverScanned = companyRegs[id] === undefined
    const load = async () => {
      const running = scansInFlight.get(id)
      if (running) {
        setScanningCompany(id)
        await running
        setScanningCompany(null)
      }
      let regs = await fetchCompanyRegulations(firmId, id).catch(() => null)
      if (regs && regs.length === 0 && neverScanned) {
        setScanningCompany(id)
        const scan = callFunction('company-regulations', { companyId: id }).then(() => true, () => false)
        scansInFlight.set(id, scan.then(() => undefined))
        const ok = await scan
        scansInFlight.delete(id)
        regs = ok ? await fetchCompanyRegulations(firmId, id).catch(() => null) : null
        setScanningCompany(null)
      }
      if (regs) setCompanyRegs(prev => ({ ...prev, [id]: regs }))
    }
    load()
  }, [firmId, activeToggle, selectedCompany])

  const toggles: { key: Toggle; label: string }[] = [
    { key: 'pe', label: 'PE Firm' },
    { key: 'fund', label: 'Fund Structure' },
    { key: 'portfolio', label: 'Portfolio Companies' },
  ]

  const selectToggle = (key: Toggle) => {
    setActiveToggle(activeToggle === key ? null : key)
    setSelectedCompany(null)
  }

  const selectCompany = (companyId: string) => {
    setSelectedCompany(selectedCompany === companyId ? null : companyId)
  }

  const firstName = firm?.lead_gp_name?.split(' ')[0] || 'there'
  const initials = (firm?.lead_gp_name || 'GP')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* Top Nav */}
      <header className="glass-nav sticky top-0 z-40">
        <div className="max-w-[1440px] mx-auto px-8 h-20 flex items-center">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <LogoMark size={32} />
            <span className="font-semibold text-base" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}>RegWay</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Settings pill */}
            <button
              onClick={() => onNavigate('profile', { tab: 'firm' })}
              className="relative flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all hover:bg-sky-50"
              style={{
                background: 'rgba(255,255,255,0.60)',
                border: '1px solid rgba(186,230,253,0.40)',
                color: '#334155',
                borderRadius: 9999,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="2" stroke="#64748B" strokeWidth="1.3"/>
                <path d="M7 1v1.5M7 11.5V13M13 7h-1.5M2.5 7H1M11.1 2.9l-1.1 1.1M4 9l-1.1 1.1M11.1 11.1L10 10M4 5L2.9 3.9" stroke="#64748B" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              Settings
              {completion.ready && completion.incomplete.length > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                  style={{ background: 'linear-gradient(135deg,#0284C7,#38BDF8)', boxShadow: '0 0 0 2px #FDFBF7' }}
                  title="Profile incomplete"
                />
              )}
            </button>

            {/* Avatar — click for Profile */}
            <button
              className="w-9 h-9 flex items-center justify-center text-sm font-semibold text-white rounded-full"
              style={{ background: 'linear-gradient(135deg,#0284C7,#38BDF8)' }}
              title="Profile"
              onClick={() => onNavigate('profile')}
            >
              {initials}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[1440px] mx-auto w-full px-8" style={{ paddingTop: 56, paddingBottom: 64 }}>

        {/* Greeting */}
        <div className="text-center" style={{ marginBottom: 48 }}>
          <h1 className="text-2xl font-semibold mb-2" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}>
            Good morning, {firstName}.
          </h1>
          <p className="text-sm" style={{ color: '#64748B' }}>
            {firm ? `Here's what's moving across ${firm.name} today.` : "Here's what's moving across your firm today."}
          </p>
        </div>

        <ProfileReminder completion={completion} onOpen={(tab, focusId) => onNavigate('profile', { tab, focusId })} />

        {/* 3-Button Toggle Bar */}
        <div className="max-w-2xl mx-auto grid grid-cols-3 gap-4">
          {toggles.map(t => {
            const active = activeToggle === t.key
            return (
              <button
                key={t.key}
                onClick={() => selectToggle(t.key)}
                className="glass-lift text-center font-semibold transition-all"
                style={{
                  borderRadius: 16,
                  padding: '28px 16px',
                  fontSize: 16,
                  background: active
                    ? 'linear-gradient(135deg, rgba(224,242,254,0.95), rgba(186,230,253,0.70))'
                    : 'rgba(255,255,255,0.88)',
                  backdropFilter: 'blur(20px) saturate(160%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(160%)',
                  border: active ? '1.5px solid rgba(56,189,248,0.55)' : '1px solid rgba(148,197,224,0.55)',
                  color: active ? '#0284C7' : '#334155',
                  boxShadow: active
                    ? 'inset 0 0 0 1.5px rgba(56,189,248,0.35), 0 8px 24px rgba(2,132,199,0.18)'
                    : '0 4px 16px rgba(15,23,42,0.08)',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {/* State-driven content */}
        <div style={{ marginTop: activeToggle ? 40 : 0, marginBottom: activeToggle ? 48 : 0 }}>
          {activeToggle === 'pe' && (
            loadingTab ? (
              <EmptyState message="Loading regulations relevant to your firm…" />
            ) : (peRegs?.length ?? 0) === 0 ? (
              <EmptyState message="No regulations have been confirmed relevant to your firm yet." />
            ) : (
              <div className="max-w-2xl mx-auto space-y-4">
                {peRegs!.map(r => (
                  <HeadlineItem key={r.id} regulation={r} onClick={() => onNavigate('detail', r)} />
                ))}
              </div>
            )
          )}

          {activeToggle === 'fund' && (
            loadingTab ? (
              <EmptyState message="Loading regulations relevant to your fund structures…" />
            ) : (fundRegs?.length ?? 0) === 0 ? (
              <EmptyState message="No regulations have been confirmed relevant to your fund structures yet." />
            ) : (
              <div className="max-w-2xl mx-auto space-y-4">
                {fundRegs!.map(r => (
                  <HeadlineItem key={r.id} regulation={r} onClick={() => onNavigate('detail', r)} />
                ))}
              </div>
            )
          )}

          {activeToggle === 'portfolio' && (
            <div className="space-y-8">
              {companies.length === 0 ? (
                <EmptyState message="No portfolio companies on file yet." />
              ) : (
                <div className="flex gap-4 overflow-x-auto scrollable justify-center flex-wrap pb-2">
                  {companies.map(co => {
                    const selected = selectedCompany === co.id
                    return (
                      <button
                        key={co.id}
                        onClick={() => selectCompany(co.id)}
                        className="glass-card-light glass-lift flex-shrink-0 w-44 text-left p-5"
                        style={{
                          boxShadow: selected ? 'inset 0 0 0 2px rgba(56,189,248,0.55)' : undefined,
                        }}
                      >
                        <div
                          className="w-11 h-11 flex items-center justify-center text-sm font-bold mb-4"
                          style={{ background: 'rgba(224,242,254,0.85)', color: '#0284C7', borderRadius: 12 }}
                        >
                          {co.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                        </div>
                        <div className="text-sm font-semibold" style={{ color: '#0F172A' }}>{co.name}</div>
                        <div className="text-xs mt-0.5" style={{ color: '#64748B' }}>{(co.sectors ?? []).join(', ')}</div>
                      </button>
                    )
                  })}
                </div>
              )}

              {selectedCompany && (
                scanningCompany === selectedCompany ? (
                  <EmptyState message="RegWay AI is searching the web for regulations affecting this company…" />
                ) : (companyRegs[selectedCompany]?.length ?? 0) === 0 ? (
                  <EmptyState message="No regulations found that affect this company right now." />
                ) : (
                  <div className="max-w-2xl mx-auto space-y-4">
                    {companyRegs[selectedCompany]!.map(r => (
                      <HeadlineItem key={r.id} regulation={r} onClick={() => onNavigate('detail', r)} />
                    ))}
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* RegWay AI Input Bar */}
        <div className="max-w-2xl mx-auto" style={{ marginTop: activeToggle ? 0 : 48 }}>
          <div className="relative">
            <input
              className="glass-input w-full py-5 px-7 pr-28 text-sm"
              style={{ fontSize: 14, color: '#0F172A' }}
              placeholder="Ask RegWay AI about today's regulatory impact across your funds and portfolio..."
              value={aiQuery}
              onChange={e => setAiQuery(e.target.value)}
              onFocus={() => onNavigate('ai')}
              onKeyDown={e => e.key === 'Enter' && onNavigate('ai')}
            />
            {/* Attachment */}
            <button
              className="absolute right-24 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full hover:bg-sky-50 transition-colors"
              style={{ color: '#94a3b8' }}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M11.5 5L6.2 10.3a2 2 0 002.8 2.8l5.3-5.3a3.5 3.5 0 00-5-5L3.5 8.6a5 5 0 007 7L15 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </button>
            {/* Mic */}
            <button
              className="absolute right-14 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full hover:bg-sky-50 transition-colors"
              style={{ color: '#94a3b8' }}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <rect x="5" y="1" width="6" height="9" rx="3" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M2 8c0 3.3 2.7 6 6 6s6-2.7 6-6M8 14v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </button>
            {/* Send */}
            <button
              onClick={() => onNavigate('ai')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-white"
              style={{ background: 'linear-gradient(135deg,#0284C7,#38BDF8)', borderRadius: 9999, boxShadow: '0 4px 12px rgba(2,132,199,0.30)' }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M14 8L2 2l3 6-3 6 12-6z" fill="white"/>
              </svg>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          background: 'rgba(255,255,255,0.60)',
          backdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(186,230,253,0.30)',
        }}
      >
        <div className="max-w-[1440px] mx-auto px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LogoMark size={24} />
            <span className="text-sm font-semibold" style={{ color: '#334155' }}>RegWay</span>
            <span className="text-xs ml-2" style={{ color: '#94a3b8' }}>© 2026 · Regulatory intelligence for private markets</span>
          </div>
          <div className="flex items-center gap-6">
            {['About Us', 'Landing Page', 'Sources', 'Legal Disclaimers', 'Privacy Policy'].map(link => (
              <a
                key={link}
                href="#"
                className="text-xs hover:text-sky-600 transition-colors"
                style={{ color: '#64748B' }}
              >
                {link}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
