import { useState } from 'react'
import Chip from '../Chip'

// Fund ↔ company holdings, shown on both sides of the relationship. Saved on
// each toggle rather than with the questionnaire's "Save changes": it's a
// link between two records, not a fact about either. An empty set reads as
// "Not recorded", never "no fund" (spec §3: ownership is never inferred).
// `null` means still loading: nothing is claimed until the holdings arrive.

const NotRecorded = () => (
  <span className="text-[10px] font-medium px-2 py-0.5" style={{ borderRadius: 9999, background: 'rgba(148,163,184,0.15)', color: '#64748B' }}>
    Not recorded
  </span>
)

const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-xs font-medium" style={{ color: '#334155' }}>{children}</label>
)

// On a company card: pick which of the firm's funds hold it.
export function HeldByFundsField({
  funds,
  heldFundIds,
  onToggle,
}: {
  funds: { id: string; name: string }[]
  heldFundIds: Set<string> | null
  onToggle: (fundId: string, held: boolean) => Promise<void>
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggle = async (fundId: string) => {
    setBusyId(fundId)
    setError(null)
    try {
      await onToggle(fundId, !heldFundIds?.has(fundId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5 min-h-[20px]">
        <Label>Which of your funds hold this company?</Label>
        {heldFundIds?.size === 0 && <NotRecorded />}
      </div>
      {funds.length === 0 ? (
        <p className="text-xs" style={{ color: '#94a3b8' }}>Add a fund first, then link it here.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {funds.map(f => (
            <Chip key={f.id} selected={!!heldFundIds?.has(f.id)} onClick={() => heldFundIds && busyId === null && toggle(f.id)}>
              {f.name}
            </Chip>
          ))}
        </div>
      )}
      <p className="text-[11px] mt-1.5" style={{ color: '#94a3b8' }}>
        {error ?? 'Saved as you select. A fund is shown developments that reach the companies it holds; leave it unset if unsure.'}
      </p>
    </div>
  )
}

// On a fund card: which companies it holds (edited from each company's card).
export function HoldingsSummary({ companyNames }: { companyNames: string[] | null }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5 min-h-[20px]">
        <Label>Portfolio companies this fund holds</Label>
        {companyNames?.length === 0 && <NotRecorded />}
      </div>
      {!!companyNames?.length && <p className="text-sm" style={{ color: '#0F172A' }}>{companyNames.join(', ')}</p>}
      <p className="text-[11px] mt-1.5" style={{ color: '#94a3b8' }}>Set on each company's card under Portfolio Companies.</p>
    </div>
  )
}
