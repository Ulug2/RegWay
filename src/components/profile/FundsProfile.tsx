import { useEffect, useState } from 'react'
import { fetchFunds, getCachedFunds, addFund, saveFundAnswers, removeFund } from '../../lib/data'
import { fromRow, missingRequired } from '../../lib/questionnaire'
import type { Fund } from '../../lib/types'
import EntityCard from './EntityCard'
import AddEntityCard from './AddEntityCard'

export default function FundsProfile({ firmId, focusId }: { firmId: string; focusId?: string | null }) {
  const [funds, setFunds] = useState<Fund[] | null>(() => getCachedFunds() ?? null)
  const reload = () => fetchFunds(firmId).then(setFunds)
  useEffect(() => { reload() }, [firmId])

  const firstIncomplete = funds?.find(f => missingRequired('fund', fromRow('fund', f as unknown as Record<string, unknown>)).length > 0)

  return (
    <div className="space-y-5">
      {funds?.length === 0 && <p className="text-sm" style={{ color: '#94a3b8' }}>No funds yet. Add your first below.</p>}
      {funds?.map(f => (
        <EntityCard
          key={f.id}
          scope="fund"
          title={f.name}
          subtitle={f.structure ?? undefined}
          row={f as unknown as Record<string, unknown>}
          defaultOpen={focusId ? f.id === focusId : f.id === firstIncomplete?.id && funds.length === 1}
          onSave={async a => { await saveFundAnswers(f.id, a); await reload() }}
          onRemove={async () => { await removeFund(f.id); await reload() }}
        />
      ))}
      <AddEntityCard scope="fund" heading="Add a fund" cta="Add Fund" onAdd={async a => { await addFund(firmId, a); await reload() }} />
    </div>
  )
}
