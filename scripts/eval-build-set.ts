// pnpm eval:build-set [--firm 'H.I.G.*'] [--out tests/eval/<file>.json] [--text-chars 6000] [--exclude <set.json>]
//
// --exclude leaves out every document already in another set, to build a
// second set that adds to it. --rejected N takes N regulatory documents the
// judges rejected instead of PLAN's number (half from agencies near the
// firm's business), to fill a set when the matched ones are used up.
//
// Builds the test set for matching (system guide §17.1) from a database:
// the firm as it stands today (every profile answer, where each came from,
// which fund holds which company) and about 150 documents chosen by
// scripts/eval/selectSet.ts, each with what RegWay's matchers said in
// production. No AI call, no cost. The answers are left empty
// (`expected: null`): scripts/eval-mark-set.ts fills them in.
//
// Owner only: it reads the hosted database with the service key, passed in
// the environment and never written down:
//
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY="$(supabase projects api-keys --project-ref <ref> --reveal -o json | jq -r '.[] | select(.name=="service_role") | .api_key')" \
//   pnpm eval:build-set
//
// Only reads. For Federal Register documents it also reads the start of the
// published full text from federalregister.gov, for the marker only (the
// matchers are scored on the title and summary, as in production).

import { classify, pick, PLAN, type PoolDoc, type RelevanceRow, type ReviewRow } from './eval/selectSet.ts'
import type { SetDocument } from './eval/matchingSet.ts'

const arg = (name: string, fallback: string) => {
  const i = Deno.args.indexOf(`--${name}`)
  return i >= 0 ? Deno.args[i + 1] : fallback
}
const today = new Date().toISOString().slice(0, 10)
const firmPattern = arg('firm', 'H.I.G.*')
const out = arg('out', `tests/eval/hig-${today}.json`)
const textChars = Number(arg('text-chars', '6000'))
const seed = arg('seed', today)
const exclude = arg('exclude', '')

const url = Deno.env.get('SUPABASE_URL')
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see the top of this file).')
  Deno.exit(1)
}

// Every row of a query, a thousand at a time.
async function rows<T>(path: string): Promise<T[]> {
  const all: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const sep = path.includes('?') ? '&' : '?'
    const res = await fetch(`${url}/rest/v1/${path}${sep}limit=1000&offset=${offset}`, { headers: { apikey: key!, Authorization: `Bearer ${key}` } })
    if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
    const page = (await res.json()) as T[]
    all.push(...page)
    if (page.length < 1000) return all
  }
}

type Row = Record<string, unknown> & { id: string; name: string }

const firms = await rows<Row>(`firms?select=*&name=ilike.${encodeURIComponent(firmPattern)}`)
if (firms.length !== 1) {
  console.error(`Expected one firm named like "${firmPattern}", found ${firms.length}.`)
  Deno.exit(1)
}
const firm = firms[0]
const funds = await rows<Row>(`funds?select=*&firm_id=eq.${firm.id}&order=name`)
const companies = await rows<Row>(`portfolio_companies?select=*&firm_id=eq.${firm.id}&order=name`)
const holdings = await rows<{ fund_id: string; portfolio_company_id: string }>(`fund_holdings?select=fund_id,portfolio_company_id&firm_id=eq.${firm.id}`)
const relevance = await rows<RelevanceRow>(`regulation_relevance?select=regulation_id,fund_id,portfolio_company_id,relevance_reason,via_holdings&firm_id=eq.${firm.id}`)
const reviews = await rows<ReviewRow>(`verdict_reviews?select=regulation_id,decision,scope,entity_name,reason,restored_at&firm_id=eq.${firm.id}`)
// Company web-scan results (ai_search) are found by a different path, not
// the judges, so they are left out.
const pool = await rows<PoolDoc>('regulations?select=id,source,category,agency,published_date&duplicate_of=is.null&category=in.(regulatory,geopolitical)&source=neq.ai_search&title=not.is.null')

const fundName = new Map(funds.map(f => [f.id, f.name]))
const companyName = new Map(companies.map(c => [c.id, c.name]))
const judgements = classify(relevance, reviews, { funds: fundName, companies: companyName })
const taken = new Set<string>(exclude ? (JSON.parse(await Deno.readTextFile(exclude)) as { documents: { id: string }[] }).documents.map(d => d.id) : [])
const rejected = Number(arg('rejected', String(PLAN.regulatory.rejected)))
const plan = { ...PLAN, regulatory: { ...PLAN.regulatory, rejected } }
const picked = pick(pool.filter(d => !taken.has(d.id)), judgements, seed, plan)

interface RegulationRow {
  id: string
  source: string
  title: string
  agency: string | null
  jurisdiction: string | null
  summary: string | null
  countries: string[] | null
  published_date: string | null
  effective_date: string | null
  source_url: string | null
  raw: Record<string, unknown> | null
}

// The chosen documents in full, a hundred ids at a time.
const full = new Map<string, RegulationRow>()
const ids = picked.map(p => p.doc.id)
for (let i = 0; i < ids.length; i += 100) {
  const chunk = ids.slice(i, i + 100).join(',')
  for (const r of await rows<RegulationRow>(`regulations?select=id,source,category,title,agency,jurisdiction,summary,countries,published_date,effective_date,source_url,raw&id=in.(${chunk})`)) {
    full.set(r.id, r)
  }
}

const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim()

// More of the document than the summary, for the marker: the start of a
// Federal Register document's full text (its summary, dates and
// background), or a travel advisory's own words.
async function moreText(r: RegulationRow): Promise<string | null> {
  const raw = r.raw ?? {}
  if (typeof raw.narrative_text === 'string') return raw.narrative_text.slice(0, textChars)
  const textUrl = typeof raw.raw_text_url === 'string' ? raw.raw_text_url : null
  if (!textUrl || !textUrl.startsWith('https://www.federalregister.gov/')) {
    return typeof raw.abstract === 'string' && raw.abstract !== r.summary ? raw.abstract : null
  }
  try {
    const res = await fetch(textUrl)
    if (!res.ok) return null
    return plain(await res.text()).slice(0, textChars)
  } catch {
    return null
  }
}

const strip = (row: Row, drop: string[]) => Object.fromEntries(Object.entries(row).filter(([k]) => !drop.includes(k)))
const documents: SetDocument[] = []
let withText = 0
for (const { doc, regway } of picked) {
  const r = full.get(doc.id)
  if (!r) continue
  const text = await moreText(r)
  if (text) withText++
  documents.push({
    id: doc.id,
    category: doc.category,
    source: r.source,
    title: r.title,
    agency: r.agency,
    jurisdiction: r.jurisdiction ?? null,
    summary: r.summary,
    countries: r.countries ?? [],
    published_date: r.published_date,
    effective_date: r.effective_date ?? null,
    source_url: r.source_url,
    text,
    regway,
    expected: null,
    why: null,
  })
}

const set = {
  name: `${firm.name}, ${today}`,
  notes: `Built ${today} by scripts/eval-build-set.ts (seed "${seed}") from production: the firm as it stood that day, and documents RegWay matched, that the Skeptic rejected, that the judges rejected, and that were never judged ("regway" on each says which; the marker never sees it). "text" is more of the document, for the marker only; the matchers are scored on the title and summary.`,
  firm: strip(firm, ['id', 'created_by']),
  funds: funds.map(f => strip(f, ['id', 'firm_id'])),
  companies: companies.map(c => strip(c, ['id', 'firm_id', 'logo_url', 'last_scanned_at'])),
  holdings: holdings.map(h => ({ fund: fundName.get(h.fund_id)!, company: companyName.get(h.portfolio_company_id)! })).filter(h => h.fund && h.company),
  documents,
}

await Deno.writeTextFile(out, JSON.stringify(set, null, 2) + '\n')
const count = (category: string, verdict: string) => documents.filter(d => d.category === category && d.regway?.verdict === verdict).length
console.log(`Wrote ${out}: ${documents.length} documents (${withText} with more text), ${funds.length} funds, ${companies.length} companies, ${set.holdings.length} holdings.`)
for (const category of ['regulatory', 'geopolitical']) {
  console.log(`  ${category}: ${['matched', 'skeptic_rejected', 'rejected', 'unjudged'].map(v => `${v} ${count(category, v)}`).join(', ')}`)
}
