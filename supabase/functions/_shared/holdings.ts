// Fund-level relevance derived from holdings (spec §9, §13). A fund's
// exposure to a development is exactly "a company it holds has a supported
// connection to it", so it's computed from the company verdicts already in
// `regulation_relevance` plus `fund_holdings`: no AI call, and no way for a
// model to invent an ownership link (spec §3).
//
// Only the fund gets a derived row. A sibling company in the same fund gets
// nothing from it (spec §13: Harbor and Cedar don't match because the same
// fund owns Lumen).
//
// Derived rows carry `via_holdings = true` and are recomputed from scratch on
// each call: added when a held company gains a match, rewritten when the
// path changes, removed when the holding or the company match goes away. A
// direct verdict about the fund itself (via_holdings = false) is never
// overwritten. User dismissals are kept.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

type Category = 'regulatory' | 'enforcement' | 'geopolitical'

interface CompanyMatch {
  regulation_id: string
  portfolio_company_id: string
  relevance_reason: string
}

interface FundRelevanceRow {
  id: string
  regulation_id: string
  fund_id: string
  relevance_reason: string | null
  via_holdings: boolean
  dismissed_at: string | null
}

const key = (regulationId: string, fundId: string) => `${regulationId}|${fundId}`

// "Fund I holds Acme, which has a direct connection: Acme is headquartered
// in Italy; …". The company verdict's own "Direct:"/"Indirect:" label
// describes the company's link, so it's restated rather than repeated.
function holdingPath(fund: string, company: string, companyReason: string): string {
  const label = /^(direct|indirect)\s*:\s*/i.exec(companyReason)
  const kind = label?.[1].toLowerCase()
  const connection = kind === 'indirect' ? 'an indirect connection' : kind ? `a ${kind} connection` : 'a connection'
  return `${fund} holds ${company}, which has ${connection}: ${companyReason.slice(label?.[0].length ?? 0)}`
}

// Brings this firm's derived fund rows for one category in line with its
// current holdings and company matches. Returns the ids of still-matched
// regulations whose fund rows were added, changed or removed, so their
// impact analyses can be regenerated with the right fund cards.
export async function syncHoldingsRollup(
  admin: SupabaseClient,
  firmId: string,
  category: Category,
  names: { funds: { id: string; name: string }[]; companies: { id: string; name: string }[] },
): Promise<string[]> {
  const [holdingsRes, companyRes, fundRes] = await Promise.all([
    admin.from('fund_holdings').select('fund_id, portfolio_company_id').eq('firm_id', firmId),
    admin
      .from('regulation_relevance')
      .select('regulation_id, portfolio_company_id, relevance_reason, regulations!inner(category)')
      .eq('firm_id', firmId)
      .eq('regulations.category', category)
      .not('portfolio_company_id', 'is', null)
      .is('dismissed_at', null)
      .not('relevance_reason', 'like', 'NOT_RELEVANT:%'),
    admin
      .from('regulation_relevance')
      .select('id, regulation_id, fund_id, relevance_reason, via_holdings, dismissed_at, regulations!inner(category)')
      .eq('firm_id', firmId)
      .eq('regulations.category', category)
      .not('fund_id', 'is', null),
  ])
  for (const res of [holdingsRes, companyRes, fundRes]) if (res.error) throw res.error

  const fundName = new Map(names.funds.map(f => [f.id, f.name]))
  const companyName = new Map(names.companies.map(c => [c.id, c.name]))
  const fundsHolding = new Map<string, string[]>()
  for (const h of holdingsRes.data ?? []) fundsHolding.set(h.portfolio_company_id, [...(fundsHolding.get(h.portfolio_company_id) ?? []), h.fund_id])

  // What each (development, fund) pair should say: one path per held company.
  const paths = new Map<string, { regulationId: string; fundId: string; lines: string[] }>()
  for (const m of (companyRes.data ?? []) as unknown as CompanyMatch[]) {
    for (const fundId of fundsHolding.get(m.portfolio_company_id) ?? []) {
      const k = key(m.regulation_id, fundId)
      const entry = paths.get(k) ?? { regulationId: m.regulation_id, fundId, lines: [] }
      entry.lines.push(holdingPath(fundName.get(fundId) ?? 'This fund', companyName.get(m.portfolio_company_id) ?? 'a portfolio company', m.relevance_reason))
      paths.set(k, entry)
    }
  }
  const desired = new Map(
    [...paths].map(([k, p]) => [k, { regulationId: p.regulationId, fundId: p.fundId, reason: `Indirect: ${p.lines.sort().join(' Also, ')}` }]),
  )

  const existing = new Map(((fundRes.data ?? []) as unknown as FundRelevanceRow[]).map(r => [key(r.regulation_id, r.fund_id), r]))

  const upserts = [...desired]
    .filter(([k, d]) => {
      const row = existing.get(k)
      return !row || (row.via_holdings && row.relevance_reason !== d.reason)
    })
    .map(([, d]) => ({
      regulation_id: d.regulationId,
      firm_id: firmId,
      fund_id: d.fundId,
      portfolio_company_id: null,
      relevance_reason: d.reason,
      via_holdings: true,
    }))

  const stale = [...existing]
    .filter(([k, row]) => row.via_holdings && !row.dismissed_at && !desired.has(k))
    .map(([, row]) => row.id)

  if (upserts.length) {
    const { error } = await admin.from('regulation_relevance').upsert(upserts, { onConflict: 'regulation_id,firm_id,portfolio_company_id,fund_id' })
    if (error) throw error
  }
  if (stale.length) {
    const { error } = await admin.from('regulation_relevance').delete().in('id', stale)
    if (error) throw error
  }

  // A removed fund row also changes the analysis (one card fewer), but only
  // matters while the development is still matched to the company.
  const stillMatched = new Set(((companyRes.data ?? []) as unknown as CompanyMatch[]).map(m => m.regulation_id))
  const removedFrom = [...existing].filter(([, row]) => stale.includes(row.id)).map(([, row]) => row.regulation_id)
  return [...new Set([...upserts.map(u => u.regulation_id), ...removedFrom.filter(id => stillMatched.has(id))])]
}
