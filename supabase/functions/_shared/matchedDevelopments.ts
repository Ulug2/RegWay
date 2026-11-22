// The developments RegWay has already matched to a firm, as prompt context:
// what the dashboard shows, grouped by development with each entity's own
// reason. Used by regway-ai-chat so "what's relevant to us?" is answered
// from the firm's actual matches, not a fresh, disconnected web search.
//
// Read through the caller's own (RLS-scoped) client: a forged fund/company
// id in the request can only ever narrow the caller's own firm's rows.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'

export type MatchScope =
  | { type: 'firm' } // everything matched to the firm, its funds and companies
  | { type: 'fund'; id: string }
  | { type: 'company'; id: string }
  | { type: 'regulation'; id: string }

// Enough for any realistic firm's live list while keeping the prompt small;
// newest first, so a cut drops the oldest.
const MAX_DEVELOPMENTS = 40
const REASON_CHARS = 320

interface Row {
  relevance_reason: string | null
  fund_id: string | null
  portfolio_company_id: string | null
  funds: { name: string } | null
  portfolio_companies: { name: string } | null
  regulations: {
    id: string
    title: string
    category: string
    agency: string | null
    jurisdiction: string | null
    published_date: string | null
    on_public_inspection: boolean | null
    source: string
    duplicate_of: string | null
  } | null
}

export interface MatchedDevelopments {
  text: string
  // Developments matched in scope, and how many of them `text` lists.
  count: number
  shown: number
}

export async function loadMatchedDevelopments(client: SupabaseClient, firmId: string, firmName: string, scope: MatchScope): Promise<MatchedDevelopments> {
  let query = client
    .from('regulation_relevance')
    .select(
      'relevance_reason, fund_id, portfolio_company_id, funds(name), portfolio_companies(name), regulations(id, title, category, agency, jurisdiction, published_date, on_public_inspection, source, duplicate_of)',
    )
    .eq('firm_id', firmId)
    .is('dismissed_at', null)
    .not('relevance_reason', 'like', 'NOT_RELEVANT:%')
  if (scope.type === 'fund') query = query.eq('fund_id', scope.id)
  if (scope.type === 'company') query = query.eq('portfolio_company_id', scope.id)
  if (scope.type === 'regulation') query = query.eq('regulation_id', scope.id)

  const { data, error } = await query
  if (error) throw error

  // One entry per development, with every entity it's matched to.
  const byRegulation = new Map<string, { reg: NonNullable<Row['regulations']>; lines: string[] }>()
  for (const row of (data ?? []) as unknown as Row[]) {
    if (!row.regulations) continue
    const entity = row.fund_id ? `Fund ${row.funds?.name ?? ''}` : row.portfolio_company_id ? `Company ${row.portfolio_companies?.name ?? ''}` : `Firm ${firmName}`
    const reason = (row.relevance_reason ?? '').replace(/\s+/g, ' ').slice(0, REASON_CHARS)
    const entry = byRegulation.get(row.regulations.id) ?? { reg: row.regulations, lines: [] }
    entry.lines.push(`   - ${entity.trim()}: ${reason}`)
    byRegulation.set(row.regulations.id, entry)
  }

  // One entry per development (roadmap item 15): a later version of one
  // already listed is named on the first version's line instead of being
  // listed again. An official document that followed an agency's
  // announcement is the one kept (16b.1), as on the dashboard, with the
  // announcement named on its line.
  // An entity matched only to the version that goes keeps its line.
  const entityOf = (line: string) => line.slice(0, line.indexOf(':'))
  const fold = (keptId: string, goneId: string) => {
    const kept = byRegulation.get(keptId)!
    const gone = byRegulation.get(goneId)!
    const named = new Set(kept.lines.map(entityOf))
    kept.lines.push(...gone.lines.filter(l => !named.has(entityOf(l))))
    published.set(keptId, [...(published.get(keptId) ?? []), gone.reg.title])
    byRegulation.delete(goneId)
  }
  const published = new Map<string, string[]>()
  const ANNOUNCEMENTS = ['sec_news', 'ftc_news', 'cfpb_news']
  for (const [id, { reg }] of [...byRegulation]) {
    const first = reg.duplicate_of ? byRegulation.get(reg.duplicate_of) : undefined
    if (!first) continue
    if (reg.source === 'federal_register' && ANNOUNCEMENTS.includes(first.reg.source)) fold(id, first.reg.id)
    else fold(first.reg.id, id)
  }
  for (const [id, titles] of published) byRegulation.get(id)?.lines.push(`   - Also published as: ${titles.join('; ')}`)

  const all = [...byRegulation.values()].sort((a, b) => (b.reg.published_date ?? '').localeCompare(a.reg.published_date ?? ''))
  const shown = all.slice(0, MAX_DEVELOPMENTS)
  const text = shown
    .map(({ reg, lines }) => {
      const date = reg.published_date ? (reg.on_public_inspection ? `scheduled for publication ${reg.published_date}` : `published ${reg.published_date}`) : 'date n/a'
      return `- [${reg.category}] ${reg.title} (${reg.agency ?? reg.jurisdiction ?? 'source n/a'}, ${date})\n${lines.join('\n')}`
    })
    .join('\n')
  return { text, count: all.length, shown: shown.length }
}
