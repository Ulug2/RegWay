import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { callFunction } from '../lib/functions'
import LogoMark from './LogoMark'
import TagInput from './TagInput'
import { JURISDICTIONS, SECTORS, LEGAL_STRUCTURES } from '../lib/options'

interface OnboardingModalProps {
  onComplete: () => void
}

interface PortfolioCompany {
  name: string
  sectors: string[]
  regions: string[]
  aum: string
  offerings: string
}

interface Fund {
  name: string
  size: string
  structure: string
  jurisdictions: string[]
}

export default function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState(1)

  // Step 1
  const [firmName, setFirmName] = useState('Meridian Capital Partners')
  const [hqLocation, setHqLocation] = useState('New York, NY')
  const [jurisdictions, setJurisdictions] = useState<string[]>(['Delaware', 'Luxembourg'])
  const [gpName, setGpName] = useState('James Whitmore')

  // Step 2
  const [companies, setCompanies] = useState<PortfolioCompany[]>([
    { name: 'NovaPay', sectors: ['Fintech'], regions: ['Delaware', 'New York'], aum: '$420M', offerings: 'B2B payments infrastructure' },
  ])
  const [newCompany, setNewCompany] = useState<PortfolioCompany>({ name: '', sectors: [], regions: [], aum: '', offerings: '' })

  // Step 3
  const [funds, setFunds] = useState<Fund[]>([
    { name: 'Meridian Fund VI', size: '$2.4B', structure: 'Delaware LP', jurisdictions: ['Delaware', 'New York'] },
    { name: 'Meridian Europe SCSp', size: '€800M', structure: 'Luxembourg SCSp', jurisdictions: ['Luxembourg', 'EU'] },
  ])
  const [newFund, setNewFund] = useState<Fund>({ name: '', size: '', structure: 'Delaware LP', jurisdictions: [] })

  const steps = [
    { n: 1, label: 'PE Firm Info' },
    { n: 2, label: 'Portfolio' },
    { n: 3, label: 'Fund Architecture' },
  ]

  const addCompany = () => {
    if (newCompany.name) {
      setCompanies(c => [...c, newCompany])
      setNewCompany({ name: '', sectors: [], regions: [], aum: '', offerings: '' })
    }
  }

  const addFund = () => {
    if (newFund.name) {
      setFunds(f => [...f, newFund])
      setNewFund({ name: '', size: '', structure: 'Delaware LP', jurisdictions: [] })
    }
  }

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleComplete = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Generate the id client-side and skip `.select()` on insert: asking
      // PostgREST to return the inserted row would require the SELECT policy
      // to pass immediately, but that policy depends on a firm_members row
      // that doesn't exist yet (chicken-and-egg), which makes the whole
      // insert look like an RLS failure even though it actually succeeded.
      const firmId = crypto.randomUUID()
      const { error: firmError } = await supabase
        .from('firms')
        .insert({ id: firmId, name: firmName, hq_location: hqLocation, lead_gp_name: gpName, jurisdictions })
      if (firmError) throw firmError

      const { error: memberError } = await supabase.from('firm_members').insert({ user_id: user.id, firm_id: firmId })
      if (memberError) throw memberError

      if (companies.length > 0) {
        const { error } = await supabase.from('portfolio_companies').insert(
          companies.map(c => ({
            firm_id: firmId,
            name: c.name,
            sectors: c.sectors,
            regions: c.regions,
            aum: c.aum,
            offerings: c.offerings,
          })),
        )
        if (error) throw error
      }

      if (funds.length > 0) {
        const { error } = await supabase.from('funds').insert(
          funds.map(f => ({
            firm_id: firmId,
            name: f.name,
            size: f.size,
            structure: f.structure,
            jurisdictions: f.jurisdictions,
          })),
        )
        if (error) throw error
      }

      // Backfill relevance against regulations already synced so the
      // dashboard isn't empty on first load. Fire-and-forget — the dashboard
      // will simply show more items once this finishes in the background.
      callFunction('match-relevance').catch(() => {})

      onComplete()
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Failed to save setup'
      setSaveError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(6px)' }}
    >
      <div className="glass-modal w-full max-w-2xl max-h-[90vh] overflow-y-auto scrollable">
        <div className="p-8">
          {/* Logo */}
          <div className="flex items-center gap-2 mb-8">
            <LogoMark size={36} />
            <span className="font-semibold text-lg" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}>RegWay</span>
          </div>

          {/* Progress Pills */}
          <div className="flex items-center gap-2 mb-8">
            {steps.map((s, i) => (
              <div key={s.n} className="flex items-center gap-2">
                <button
                  onClick={() => step > s.n && setStep(s.n)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all"
                  style={{
                    borderRadius: 9999,
                    background: step === s.n
                      ? 'linear-gradient(135deg, #0284C7, #38BDF8)'
                      : step > s.n
                      ? 'rgba(2,132,199,0.12)'
                      : 'rgba(186,230,253,0.25)',
                    color: step === s.n ? 'white' : step > s.n ? '#0284C7' : '#94a3b8',
                    boxShadow: step === s.n ? '0 4px 12px rgba(2,132,199,0.25)' : 'none',
                  }}
                >
                  <span
                    className="w-5 h-5 flex items-center justify-center text-xs font-bold"
                    style={{
                      borderRadius: 9999,
                      background: step === s.n ? 'rgba(255,255,255,0.25)' : 'transparent',
                    }}
                  >
                    {step > s.n ? '✓' : s.n}
                  </span>
                  {s.label}
                </button>
                {i < steps.length - 1 && (
                  <div
                    className="w-8 h-px"
                    style={{ background: step > s.n ? 'rgba(2,132,199,0.30)' : 'rgba(186,230,253,0.40)' }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold mb-1" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}>
                  PE Firm & GP Information
                </h2>
                <p className="text-sm" style={{ color: '#64748B' }}>
                  Tell us about your firm so we can tailor regulatory intelligence to your exposure.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: '#334155' }}>Firm Name</label>
                  <input
                    className="glass-input-rect"
                    value={firmName}
                    onChange={e => setFirmName(e.target.value)}
                    placeholder="e.g. Meridian Capital Partners"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: '#334155' }}>HQ Location</label>
                  <input
                    className="glass-input-rect"
                    value={hqLocation}
                    onChange={e => setHqLocation(e.target.value)}
                    placeholder="e.g. New York, NY"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#334155' }}>Operating Jurisdictions</label>
                <TagInput
                  tags={jurisdictions}
                  onAdd={j => setJurisdictions(jj => [...jj, j])}
                  onRemove={j => setJurisdictions(jj => jj.filter(x => x !== j))}
                  placeholder="Select jurisdictions..."
                  options={JURISDICTIONS}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#334155' }}>Lead General Partner</label>
                <input
                  className="glass-input-rect"
                  value={gpName}
                  onChange={e => setGpName(e.target.value)}
                  placeholder="e.g. James Whitmore"
                />
              </div>
              <div
                className="p-4 rounded-xl text-sm"
                style={{ background: 'rgba(2,132,199,0.06)', border: '1px solid rgba(2,132,199,0.12)', color: '#334155' }}
              >
                <strong style={{ color: '#0284C7' }}>Why we ask:</strong> Jurisdiction data powers real-time regulatory
                mapping across SEC, FCA, CSSF, and state-level compliance databases.
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold mb-1" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}>
                  Portfolio Companies & Investments
                </h2>
                <p className="text-sm" style={{ color: '#64748B' }}>
                  Add your portfolio companies to receive sector-specific regulatory alerts.
                </p>
              </div>

              {/* Existing companies */}
              <div className="space-y-2">
                {companies.map((co, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(186,230,253,0.40)' }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 flex items-center justify-center text-xs font-bold"
                        style={{ background: 'linear-gradient(135deg,#0284C7,#38BDF8)', borderRadius: 8, color: 'white' }}
                      >
                        {co.name[0]}
                      </div>
                      <div>
                        <div className="text-sm font-semibold" style={{ color: '#0F172A' }}>{co.name}</div>
                        <div className="text-xs" style={{ color: '#64748B' }}>{co.sectors.join(', ')} · {co.aum}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => setCompanies(c => c.filter((_, j) => j !== i))}
                      className="text-xs px-3 py-1 rounded-full hover:bg-sky-50 transition-colors"
                      style={{ color: '#64748B', border: '1px solid rgba(186,230,253,0.50)' }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              {/* Add new company */}
              <div
                className="p-4 space-y-3 rounded-xl"
                style={{ background: 'rgba(224,242,254,0.30)', border: '1px solid rgba(186,230,253,0.40)' }}
              >
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>
                  + Add Portfolio Company
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className="glass-input-rect"
                    placeholder="Company Name"
                    value={newCompany.name}
                    onChange={e => setNewCompany(c => ({ ...c, name: e.target.value }))}
                  />
                  <input
                    className="glass-input-rect"
                    placeholder="AUM / Investment Size"
                    value={newCompany.aum}
                    onChange={e => setNewCompany(c => ({ ...c, aum: e.target.value }))}
                  />
                </div>
                <TagInput
                  tags={newCompany.sectors}
                  onAdd={s => setNewCompany(c => ({ ...c, sectors: [...c.sectors, s] }))}
                  onRemove={s => setNewCompany(c => ({ ...c, sectors: c.sectors.filter(x => x !== s) }))}
                  placeholder="Industry sectors..."
                  options={SECTORS}
                />
                <input
                  className="glass-input-rect"
                  placeholder="Core offerings / client base"
                  value={newCompany.offerings}
                  onChange={e => setNewCompany(c => ({ ...c, offerings: e.target.value }))}
                />
                <button
                  onClick={addCompany}
                  className="text-sm font-medium px-4 py-2 rounded-full transition-all"
                  style={{
                    background: newCompany.name ? 'rgba(2,132,199,0.10)' : 'rgba(186,230,253,0.20)',
                    color: newCompany.name ? '#0284C7' : '#94a3b8',
                    border: '1px solid rgba(2,132,199,0.20)',
                  }}
                  disabled={!newCompany.name}
                >
                  Add Company
                </button>
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold mb-1" style={{ color: '#0F172A', letterSpacing: '-0.02em' }}>
                  Fund Architecture
                </h2>
                <p className="text-sm" style={{ color: '#64748B' }}>
                  Define your fund structures to receive jurisdiction-specific compliance monitoring.
                </p>
              </div>

              {/* Existing funds */}
              <div className="space-y-2">
                {funds.map((fund, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(186,230,253,0.40)' }}
                  >
                    <div>
                      <div className="text-sm font-semibold" style={{ color: '#0F172A' }}>{fund.name}</div>
                      <div className="text-xs" style={{ color: '#64748B' }}>
                        {fund.size} · {fund.structure} · {fund.jurisdictions.join(', ')}
                      </div>
                    </div>
                    <button
                      onClick={() => setFunds(f => f.filter((_, j) => j !== i))}
                      className="text-xs px-3 py-1 rounded-full hover:bg-sky-50 transition-colors"
                      style={{ color: '#64748B', border: '1px solid rgba(186,230,253,0.50)' }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              {/* Add new fund */}
              <div
                className="p-4 space-y-3 rounded-xl"
                style={{ background: 'rgba(224,242,254,0.30)', border: '1px solid rgba(186,230,253,0.40)' }}
              >
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>
                  + Add Fund
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className="glass-input-rect"
                    placeholder="Fund Name"
                    value={newFund.name}
                    onChange={e => setNewFund(f => ({ ...f, name: e.target.value }))}
                  />
                  <input
                    className="glass-input-rect"
                    placeholder="Fund Size (e.g. $1.2B)"
                    value={newFund.size}
                    onChange={e => setNewFund(f => ({ ...f, size: e.target.value }))}
                  />
                </div>
                <select
                  className="glass-input-rect"
                  value={newFund.structure}
                  onChange={e => setNewFund(f => ({ ...f, structure: e.target.value }))}
                >
                  {LEGAL_STRUCTURES.map(s => <option key={s}>{s}</option>)}
                </select>
                <TagInput
                  tags={newFund.jurisdictions}
                  onAdd={j => setNewFund(f => ({ ...f, jurisdictions: [...f.jurisdictions, j] }))}
                  onRemove={j => setNewFund(f => ({ ...f, jurisdictions: f.jurisdictions.filter(x => x !== j) }))}
                  placeholder="Target jurisdictions..."
                  options={JURISDICTIONS}
                />
                <button
                  onClick={addFund}
                  className="text-sm font-medium px-4 py-2 rounded-full transition-all"
                  style={{
                    background: newFund.name ? 'rgba(2,132,199,0.10)' : 'rgba(186,230,253,0.20)',
                    color: newFund.name ? '#0284C7' : '#94a3b8',
                    border: '1px solid rgba(2,132,199,0.20)',
                  }}
                  disabled={!newFund.name}
                >
                  Add Fund
                </button>
              </div>

              {/* Summary */}
              <div
                className="p-4 rounded-xl"
                style={{ background: 'rgba(2,132,199,0.06)', border: '1px solid rgba(2,132,199,0.15)' }}
              >
                <div className="text-xs font-semibold mb-2" style={{ color: '#0284C7' }}>Setup Summary</div>
                <div className="text-sm space-y-1" style={{ color: '#334155' }}>
                  <div><strong>{firmName}</strong> · {hqLocation}</div>
                  <div>{jurisdictions.length} operating jurisdictions · {companies.length} portfolio companies · {funds.length} funds</div>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          {saveError && (
            <div className="mt-6 p-3 rounded-lg text-xs" style={{ background: 'rgba(2,132,199,0.06)', border: '1px solid rgba(2,132,199,0.15)', color: '#334155' }}>
              {saveError}
            </div>
          )}
          <div className="flex items-center justify-between mt-8 pt-6" style={{ borderTop: '1px solid rgba(186,230,253,0.35)' }}>
            <button className="btn-ghost">Save Draft</button>
            <div className="flex items-center gap-3">
              {step > 1 && (
                <button
                  className="btn-ghost"
                  onClick={() => setStep(s => s - 1)}
                >
                  ← Back
                </button>
              )}
              {step < 3 ? (
                <button className="btn-primary" onClick={() => setStep(s => s + 1)}>
                  Continue →
                </button>
              ) : (
                <button className="btn-primary" onClick={handleComplete} disabled={saving}>
                  {saving ? 'Setting up…' : 'Complete Setup & Launch Dashboard'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
