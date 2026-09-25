import { useEffect, useState } from 'react'
import { fetchFirm, fetchFunds, fetchPortfolioCompanies, getCachedCompanies, getCachedFirm, getCachedFirmId, getCachedFunds, getFirmId } from './data'
import { completionFor, type CompletionItem } from './questionnaire'
import type { Firm, Fund, PortfolioCompany } from './types'

export interface ProfileCompletion {
  ready: boolean
  items: CompletionItem[]
  incomplete: CompletionItem[]
  percent: number
}

const asRow = (x: unknown) => x as Record<string, unknown>

// Completion of the required "complete later" questions across the firm, every
// fund and every portfolio company. Renders from cache first, then refreshes.
export function useProfileCompletion(): ProfileCompletion {
  const [firm, setFirm] = useState<Firm | null>(getCachedFirm)
  const [funds, setFunds] = useState<Fund[] | undefined>(getCachedFunds)
  const [companies, setCompanies] = useState<PortfolioCompany[] | undefined>(getCachedCompanies)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const id = getCachedFirmId() ?? (await getFirmId())
      if (!id) return
      const [f, fs, cs] = await Promise.all([fetchFirm(id), fetchFunds(id), fetchPortfolioCompanies(id)])
      if (!alive) return
      setFirm(f)
      setFunds(fs)
      setCompanies(cs)
    })().catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const ready = !!firm && funds !== undefined && companies !== undefined
  const items: CompletionItem[] = ready
    ? [
        completionFor('firm', null, firm!.name || 'Your firm', asRow(firm)),
        ...funds!.map(f => completionFor('fund', f.id, f.name, asRow(f))),
        ...companies!.map(c => completionFor('company', c.id, c.name, asRow(c))),
      ]
    : []
  const total = items.reduce((n, i) => n + i.total, 0)
  const answered = items.reduce((n, i) => n + i.answered, 0)
  return {
    ready,
    items,
    incomplete: items.filter(i => i.answered < i.total),
    percent: total === 0 ? 100 : (answered / total) * 100,
  }
}
