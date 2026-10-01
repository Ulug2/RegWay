import { useEffect, useState } from 'react'
import { fetchPortfolioCompanies, getCachedCompanies, addPortfolioCompany, saveCompanyAnswers, removePortfolioCompany, uploadCompanyLogo } from '../../lib/data'
import type { PortfolioCompany } from '../../lib/types'
import { prewarmCompanies } from '../../lib/scans'
import EntityCard from './EntityCard'
import AddEntityCard from './AddEntityCard'

export default function CompaniesProfile({ firmId, focusId }: { firmId: string; focusId?: string | null }) {
  const [companies, setCompanies] = useState<PortfolioCompany[] | null>(() => getCachedCompanies() ?? null)
  const reload = () => fetchPortfolioCompanies(firmId).then(setCompanies)
  useEffect(() => { reload() }, [firmId])

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
          onSave={async a => { await saveCompanyAnswers(firmId, co, a); await reload(); prewarmCompanies(firmId) }}
          onRemove={async () => { await removePortfolioCompany(co.id); await reload() }}
          logoUrl={co.logo_url}
          onUploadLogo={async file => { await uploadCompanyLogo(co.id, file); await reload() }}
        />
      ))}
      <AddEntityCard scope="company" heading="Add a portfolio company" cta="Add Company" onAdd={async a => { await addPortfolioCompany(firmId, a); await reload(); prewarmCompanies(firmId) }} />
    </div>
  )
}
