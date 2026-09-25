import { useEffect, useState } from 'react'
import {
  fetchPortfolioCompanies,
  addPortfolioCompany,
  updatePortfolioCompany,
  removePortfolioCompany,
  type PortfolioCompanyInput,
} from '../../lib/data'
import { SECTORS } from '../../lib/options'
import type { PortfolioCompany } from '../../lib/types'
import TagInput from '../TagInput'
import RemoveButton from './RemoveButton'

const EMPTY: PortfolioCompanyInput = { name: '', sectors: [], regions: [], hq_location: '', aum: '', offerings: '' }

function CompanyCard({
  initial,
  submitLabel,
  resetOnSave,
  onSave,
  onRemove,
}: {
  initial: PortfolioCompanyInput
  submitLabel: string
  resetOnSave?: boolean
  onSave: (company: PortfolioCompanyInput) => Promise<void>
  onRemove?: () => Promise<void>
}) {
  const [c, setC] = useState<PortfolioCompanyInput>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const patch = (p: Partial<PortfolioCompanyInput>) => { setC(x => ({ ...x, ...p })); setSaved(false) }

  const run = async (action: () => Promise<void>, after?: () => void) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      after?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const save = () => {
    if (!c.name.trim()) { setError('Company name is required'); return }
    run(
      () =>
        onSave({
          ...c,
          name: c.name.trim(),
          hq_location: c.hq_location?.trim() || null,
          aum: c.aum?.trim() || null,
          offerings: c.offerings?.trim() || null,
        }),
      () => (resetOnSave ? setC(EMPTY) : setSaved(true)),
    )
  }

  return (
    <div className="glass-card" style={{ padding: 24 }}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <input className="glass-input-rect" placeholder="Company name" value={c.name} onChange={e => patch({ name: e.target.value })} />
        <input className="glass-input-rect" placeholder="HQ location (e.g. London, UK)" value={c.hq_location ?? ''} onChange={e => patch({ hq_location: e.target.value })} />
        <input className="glass-input-rect" placeholder="AUM / investment size" value={c.aum ?? ''} onChange={e => patch({ aum: e.target.value })} />
        <input className="glass-input-rect" placeholder="Core offerings / client base" value={c.offerings ?? ''} onChange={e => patch({ offerings: e.target.value })} />
      </div>
      <TagInput
        tags={c.sectors}
        onAdd={s => patch({ sectors: [...c.sectors, s] })}
        onRemove={s => patch({ sectors: c.sectors.filter(x => x !== s) })}
        placeholder="Industry sectors..."
        options={SECTORS}
      />
      <p className="text-xs mt-3" style={{ color: '#94a3b8' }}>
        Changing the location or sectors clears this company's cached regulation scan so it re-runs on the next visit.
      </p>
      <div className="flex items-center gap-3 mt-4 flex-wrap">
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        {onRemove && <RemoveButton onConfirm={() => run(onRemove)} disabled={busy} />}
        {error && <span className="text-xs" style={{ color: '#334155' }}>{error}</span>}
        {saved && <span className="text-xs" style={{ color: '#0284C7' }}>Saved.</span>}
      </div>
    </div>
  )
}

export default function PortfolioSettings({ firmId }: { firmId: string }) {
  const [companies, setCompanies] = useState<PortfolioCompany[] | null>(null)
  const reload = () => fetchPortfolioCompanies(firmId).then(setCompanies)
  useEffect(() => { reload() }, [firmId])

  return (
    <div className="space-y-5">
      {companies?.length === 0 && <p className="text-sm" style={{ color: '#94a3b8' }}>No portfolio companies yet. Add your first below.</p>}
      {companies?.map(co => (
        <CompanyCard
          key={co.id}
          initial={{
            name: co.name,
            sectors: co.sectors ?? [],
            regions: co.regions ?? [],
            hq_location: co.hq_location,
            aum: co.aum,
            offerings: co.offerings,
          }}
          submitLabel="Save"
          onSave={async input => { await updatePortfolioCompany(firmId, co, input); await reload() }}
          onRemove={async () => { await removePortfolioCompany(co.id); await reload() }}
        />
      ))}
      <div className="text-xs font-semibold uppercase tracking-wider pt-2" style={{ color: '#64748B' }}>Add a portfolio company</div>
      <CompanyCard
        initial={EMPTY}
        submitLabel="Add Company"
        resetOnSave
        onSave={async input => { await addPortfolioCompany(firmId, input); await reload() }}
      />
    </div>
  )
}
