// What is recorded about a firm's entities, as prompt text for a role that
// must judge a claim against those facts (the Skeptic, the chat check).
// Built from the same helpers the matchers and the impact analysis use, so
// every role describes an entity from the same facts and marks the same
// gaps as "not recorded".

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'
import { COMPANY_FACTS, COMPANY_UNKNOWNS, FIRM_FACTS, FIRM_UNKNOWNS, FUND_FACTS, FUND_UNKNOWNS, facts } from '../entityFacts.ts'
import { companyFootprint, describeFootprint, firmFootprint } from '../footprint.ts'
import { EU_MEMBERS } from '../regulatorFeeds.ts'
import type { FirmEntities } from '../relevance.ts'

export type EntityScope = 'firm' | 'fund' | 'company'

export interface Holding {
  fund_id: string
  portfolio_company_id: string
}

export interface EntityRecord {
  scope: EntityScope
  name: string
  // "key: value; key: value; not recorded: …"
  facts: string
}

export interface FirmRecord {
  firmName: string
  entities: EntityRecord[]
  // One line per entity naming where it is connected and how
  // (headquarters, operations, suppliers), for location-based questions.
  footprints: string[]
}

export async function loadHoldings(admin: SupabaseClient, firmId: string): Promise<Holding[]> {
  const { data, error } = await admin.from('fund_holdings').select('fund_id, portfolio_company_id').eq('firm_id', firmId)
  if (error) throw error
  return (data ?? []) as Holding[]
}

// Whether an entity's recorded countries put it in the EU or the UK, said
// outright: a reviewer once judged a company headquartered in Italy as
// outside the EU customs territory.
export function regionFact(countries: string[]): string {
  const eu = [...new Set(countries.filter(c => EU_MEMBERS.has(c)))]
  const parts = [eu.length ? `in the EU (${eu.join(', ')})` : '', countries.includes('United Kingdom') ? 'in the UK, which is not in the EU' : ''].filter(Boolean)
  return parts.length ? `located ${parts.join('; and ')}` : ''
}

const countriesOf = (footprint: { facts: { country: string }[] }) => footprint.facts.map(f => f.country)

export function firmRecord(entities: FirmEntities & { firm: NonNullable<FirmEntities['firm']> }, holdings: Holding[] = []): FirmRecord {
  const { firm, funds, companies } = entities
  const nameOf = (rows: { id: string; name: string }[], id: string) => rows.find(r => r.id === id)?.name
  const records: EntityRecord[] = [
    { scope: 'firm', name: firm.name, facts: [facts(firm as unknown as Record<string, unknown>, FIRM_FACTS, FIRM_UNKNOWNS), regionFact(countriesOf(firmFootprint(firm)))].filter(Boolean).join('; ') },
    ...funds.map(f => {
      const holds = holdings.filter(h => h.fund_id === f.id).map(h => nameOf(companies, h.portfolio_company_id)).filter(Boolean)
      return { scope: 'fund' as const, name: f.name, facts: facts({ ...f, holds } as unknown as Record<string, unknown>, FUND_FACTS, FUND_UNKNOWNS) }
    }),
    ...companies.map(c => {
      const heldBy = holdings.filter(h => h.portfolio_company_id === c.id).map(h => nameOf(funds, h.fund_id)).filter(Boolean)
      const recorded = facts(c as unknown as Record<string, unknown>, COMPANY_FACTS, COMPANY_UNKNOWNS)
      return { scope: 'company' as const, name: c.name, facts: [recorded, regionFact(countriesOf(companyFootprint(c))), heldBy.length ? `held by: ${heldBy.join(', ')}` : ''].filter(Boolean).join('; ') }
    }),
  ]
  return {
    firmName: firm.name,
    entities: records,
    footprints: [firmFootprint(firm), ...companies.map(companyFootprint)].map(describeFootprint),
  }
}

// The record as prompt text: one line per entity, labelled by kind.
export function describeRecord(record: FirmRecord, opts: { footprints?: boolean } = {}): string {
  const label: Record<EntityScope, string> = { firm: 'FIRM', fund: 'FUND', company: 'COMPANY' }
  const lines = record.entities.map(e => `${label[e.scope]} — ${e.name}: ${e.facts || 'nothing recorded'}`)
  return opts.footprints ? `${lines.join('\n')}\n\nLocation footprints:\n${record.footprints.join('\n')}` : lines.join('\n')
}

// The exact name of the entity a model named, matched case-insensitively,
// or null when it names none of the firm's entities.
export function findEntity(record: FirmRecord, scope: EntityScope, name: string | null | undefined): EntityRecord | null {
  if (scope === 'firm') return record.entities.find(e => e.scope === 'firm') ?? null
  if (!name) return null
  const wanted = name.trim().toLowerCase()
  return record.entities.find(e => e.scope === scope && e.name.toLowerCase() === wanted) ?? null
}
