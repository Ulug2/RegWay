import { useEffect, useState } from 'react'
import { fetchPortfolioCompanies, getCachedCompanies, addPortfolioCompany, saveCompanyAnswers, removePortfolioCompany, uploadCompanyLogo, fetchFunds, getCachedFunds, fetchHoldings, setHolding } from '../../lib/data'
import type { Fund, FundHolding, PortfolioCompany } from '../../lib/types'
import { prewarmCompanies } from '../../lib/scans'
import EntityCard from './EntityCard'
import AddEntityCard from './AddEntityCard'
import { HeldByFundsField } from './FundHoldings'

export default function CompaniesProfile({ firmId, focusId }: { firmId: string; focusId?: string | null }) {
  const [companies, setCompanies] = useState<PortfolioCompany[] | null>(() => getCachedCompanies() ?? null)
  const [funds, setFunds] = useState<Fund[]>(() => getCachedFunds() ?? [])
  const [holdings, setHoldings] = useState<FundHolding[] | null>(null)
  const reload = () => fetchPortfolioCompanies(firmId).then(setCompanies)
  const reloadHoldings = () => fetchHoldings(firmId).then(setHoldings)
  useEffect(() => {
    reload()
    fetchFunds(firmId).then(setFunds)
    reloadHoldings()
  }, [firmId])

  const heldBy = (companyId: string) => holdings && new Set(holdings.filter(h => h.portfolio_company_id === companyId).map(h => h.fund_id))

  return (
    <div className="space-y-5">
      {companies?.length === 0 && <p className="text-sm" style={{ color: '#94a3b8' }}>No portfolio companies yet. Add your first below.</p>}
      {companies?.map(co => (
        <EntityCard
          key={co.id}
          scope="company"
          title={co.name}
          subtitle={co.hq_location ?? undefined}
          row={co as unknown as Record<string, unknown>}
          defaultOpen={co.id === focusId || (!focusId && companies.length === 1)}
          onSave={async (a, meta) => { await saveCompanyAnswers(firmId, co, a, meta); await reload(); prewarmCompanies(firmId) }}
          onRemove={async () => { await removePortfolioCompany(co.id); await reload() }}
          logoUrl={co.logo_url}
          onUploadLogo={async file => { await uploadCompanyLogo(co.id, file); await reload() }}
          extra={
            <HeldByFundsField
              funds={funds}
              heldFundIds={heldBy(co.id)}
              onToggle={async (fundId, held) => { await setHolding(firmId, fundId, co.id, held); await reloadHoldings() }}
            />
          }
        />
      ))}
      <AddEntityCard scope="company" heading="Add a portfolio company" cta="Add Company" onAdd={async a => { await addPortfolioCompany(firmId, a); await reload(); prewarmCompanies(firmId) }} />
    </div>
  )
}
