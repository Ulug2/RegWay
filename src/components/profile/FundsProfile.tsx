import { useEffect, useState } from 'react'
import { fetchFunds, getCachedFunds, addFund, saveFundAnswers, removeFund, fetchPortfolioCompanies, getCachedCompanies, fetchHoldings } from '../../lib/data'
import { fromRow, missingRequired } from '../../lib/questionnaire'
import type { Fund, FundHolding, PortfolioCompany } from '../../lib/types'
import EntityCard from './EntityCard'
import AddEntityCard from './AddEntityCard'
import { HoldingsSummary } from './FundHoldings'

export default function FundsProfile({ firmId, focusId }: { firmId: string; focusId?: string | null }) {
  const [funds, setFunds] = useState<Fund[] | null>(() => getCachedFunds() ?? null)
  const [companies, setCompanies] = useState<PortfolioCompany[]>(() => getCachedCompanies() ?? [])
  const [holdings, setHoldings] = useState<FundHolding[] | null>(null)
  const reload = () => fetchFunds(firmId).then(setFunds)
  useEffect(() => {
    reload()
    fetchPortfolioCompanies(firmId).then(setCompanies)
    fetchHoldings(firmId).then(setHoldings)
  }, [firmId])

  const heldCompanyNames = (fundId: string) =>
    holdings && companies.filter(c => holdings.some(h => h.fund_id === fundId && h.portfolio_company_id === c.id)).map(c => c.name)

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
          extra={<HoldingsSummary companyNames={heldCompanyNames(f.id)} />}
        />
      ))}
      <AddEntityCard scope="fund" heading="Add a fund" cta="Add Fund" onAdd={async a => { await addFund(firmId, a); await reload() }} />
    </div>
  )
}
