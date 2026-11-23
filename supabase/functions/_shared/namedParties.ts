// Which of a firm's own entities an enforcement release names (issue #41).
// The enforcement matcher and analysis treat every case as one against
// someone else, compared with what the firm's entities do. A DOJ or SEC
// release can instead be about the firm's own portfolio company (a False
// Claims Act settlement, a plea): then the firm must be told that plainly,
// not that a stranger did "similar conduct". Found here by name, in code,
// before any AI call, so it costs nothing and never depends on the model.
//
// A name match is not proof it is the same company ("Apex" is common), so
// what RegWay says always asks the reader to check.

export interface NamedEntities {
  firm: { name: string } | null
  funds: { id: string; name: string }[] | null
  companies: { id: string; name: string }[] | null
}

export interface NamedParty {
  scope: 'firm' | 'fund' | 'company'
  id: string | null
  name: string
}

// Endings that are not part of what a release calls a company: "InnovAge
// Holding Corporation" is "InnovAge" in a headline.
const SUFFIXES = new Set(['inc', 'incorporated', 'llc', 'l', 'c', 'corp', 'corporation', 'co', 'company', 'ltd', 'limited', 'lp', 'llp', 'plc', 'p', 'holding', 'holdings', 'group', 'the'])
// Names that, alone, would match ordinary words in a release.
const TOO_COMMON = new Set(['capital', 'partners', 'health', 'healthcare', 'bank', 'group', 'holdings', 'fund', 'services', 'solutions', 'systems', 'technologies', 'american', 'national', 'united', 'global', 'international', 'first', 'general', 'energy', 'medical'])

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[’']s\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// The distinctive part of a name, or null when what's left is too short or
// too ordinary to search for.
export function coreName(name: string): string | null {
  const parts = words(name).split(' ').filter(Boolean)
  while (parts.length > 1 && SUFFIXES.has(parts[parts.length - 1])) parts.pop()
  while (parts.length > 1 && parts[0] === 'the') parts.shift()
  const core = parts.join(' ')
  if (core.replace(/ /g, '').length < 4) return null
  if (parts.length === 1 && TOO_COMMON.has(core)) return null
  return core
}

// The firm's entities whose name appears, as whole words, in the release.
export function namedParties(text: string, entities: NamedEntities): NamedParty[] {
  const haystack = ` ${words(text)} `
  const found: NamedParty[] = []
  const check = (scope: NamedParty['scope'], id: string | null, name: string | undefined) => {
    if (!name) return
    const core = coreName(name)
    if (core && haystack.includes(` ${core} `)) found.push({ scope, id, name })
  }
  check('firm', null, entities.firm?.name)
  for (const f of entities.funds ?? []) check('fund', f.id, f.name)
  for (const c of entities.companies ?? []) check('company', c.id, c.name)
  return found
}

// What the release says, as stored by the enforcement syncs.
export const releaseText = (r: { title: string; summary?: string | null; raw?: Record<string, unknown> | null }) =>
  [r.title, r.summary ?? '', typeof r.raw?.narrative_text === 'string' ? r.raw.narrative_text : ''].join('\n')

const NOUN: Record<NamedParty['scope'], string> = { firm: 'your firm', fund: 'one of your funds', company: 'one of your portfolio companies' }
const SAME: Record<NamedParty['scope'], string> = { firm: 'firm', fund: 'fund', company: 'company' }

// The match's reason, shown on the card.
export const namedPartyReason = (p: NamedParty) => `This release names ${p.name}, ${NOUN[p.scope]}. Check that it is the same ${SAME[p.scope]}.`
