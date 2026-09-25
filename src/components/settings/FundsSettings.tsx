import { useEffect, useState } from 'react'
import { fetchFunds, addFund, updateFund, removeFund, type FundInput } from '../../lib/data'
import { JURISDICTIONS, LEGAL_STRUCTURES } from '../../lib/options'
import type { Fund } from '../../lib/types'
import TagInput from '../TagInput'
import RemoveButton from './RemoveButton'

const EMPTY: FundInput = { name: '', size: '', structure: 'Delaware LP', jurisdictions: [] }

function FundCard({
  initial,
  submitLabel,
  resetOnSave,
  onSave,
  onRemove,
}: {
  initial: FundInput
  submitLabel: string
  resetOnSave?: boolean
  onSave: (fund: FundInput) => Promise<void>
  onRemove?: () => Promise<void>
}) {
  const [fund, setFund] = useState<FundInput>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const patch = (p: Partial<FundInput>) => { setFund(f => ({ ...f, ...p })); setSaved(false) }

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
    if (!fund.name.trim()) { setError('Fund name is required'); return }
    run(
      () => onSave({ ...fund, name: fund.name.trim(), size: fund.size?.trim() || null }),
      () => (resetOnSave ? setFund(EMPTY) : setSaved(true)),
    )
  }

  return (
    <div className="glass-card" style={{ padding: 24 }}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <input className="glass-input-rect" placeholder="Fund name" value={fund.name} onChange={e => patch({ name: e.target.value })} />
        <input className="glass-input-rect" placeholder="Fund size (e.g. $1.2B)" value={fund.size ?? ''} onChange={e => patch({ size: e.target.value })} />
      </div>
      <div className="space-y-3">
        <select className="glass-input-rect" value={fund.structure ?? ''} onChange={e => patch({ structure: e.target.value })}>
          {LEGAL_STRUCTURES.map(s => <option key={s}>{s}</option>)}
        </select>
        <TagInput
          tags={fund.jurisdictions}
          onAdd={j => patch({ jurisdictions: [...fund.jurisdictions, j] })}
          onRemove={j => patch({ jurisdictions: fund.jurisdictions.filter(x => x !== j) })}
          placeholder="Target jurisdictions..."
          options={JURISDICTIONS}
        />
      </div>
      <div className="flex items-center gap-3 mt-4 flex-wrap">
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        {onRemove && <RemoveButton onConfirm={() => run(onRemove)} disabled={busy} />}
        {error && <span className="text-xs" style={{ color: '#334155' }}>{error}</span>}
        {saved && <span className="text-xs" style={{ color: '#0284C7' }}>Saved.</span>}
      </div>
    </div>
  )
}

export default function FundsSettings({ firmId }: { firmId: string }) {
  const [funds, setFunds] = useState<Fund[] | null>(null)
  const reload = () => fetchFunds(firmId).then(setFunds)
  useEffect(() => { reload() }, [firmId])

  return (
    <div className="space-y-5">
      {funds?.length === 0 && <p className="text-sm" style={{ color: '#94a3b8' }}>No funds yet. Add your first below.</p>}
      {funds?.map(f => (
        <FundCard
          key={f.id}
          initial={{ name: f.name, size: f.size, structure: f.structure, jurisdictions: f.jurisdictions ?? [] }}
          submitLabel="Save"
          onSave={async input => { await updateFund(f.id, input); await reload() }}
          onRemove={async () => { await removeFund(f.id); await reload() }}
        />
      ))}
      <div className="text-xs font-semibold uppercase tracking-wider pt-2" style={{ color: '#64748B' }}>Add a fund</div>
      <FundCard
        initial={EMPTY}
        submitLabel="Add Fund"
        resetOnSave
        onSave={async input => { await addFund(firmId, input); await reload() }}
      />
    </div>
  )
}
