# Geopolitical monitoring, including sanctions — investigate

Roadmap: `plans/regway-mvp-roadmap.md` → Priority order item 1.
Spec: `docs/Regway_AI_Features_and_User_Journey.docx` §8 (geopolitical), §9
(exposure mapping), §12 (coverage), §13 (Lumen/Region C example).

## Prompt

> Read the roadmap, start from the first priority task. Always use an audit
> then implement flow. Save prompts under prompts/. Write clean, organized
> and, most importantly, scalable code.

Audit scope: what exists today for geopolitical/sanctions coverage, which
official sources can feed it, what the matching step must do differently
from regulatory/enforcement matching, and what blocks a build.

## What the spec requires (§8, §9, §13)

- Topics: sanctions announcements, tariffs, trade restrictions, political
  disruption, events affecting locations or supply routes in the profile.
- **Not a world-news page.** An item appears only when the system can name
  the connection, or a specific fact that needs confirming.
- Direct (company facility in an affected country) vs. indirect (supplier
  in that country; fund that invests in such a company) must be stated
  separately, with the relationship path written out.
- Official sanctions announcements distinguished from commentary.
- Presence in a sanctioned country ≠ the company is sanctioned or a
  transaction is prohibited. Similar names ≠ confirmed identity.
- Not a transaction approval engine; cautious, factual language.
- Missing supplier data stays visibly unknown, never "no exposure."

## What exists today

| Piece | State |
|---|---|
| `regulations.category` | `'geopolitical'` already allowed by the check constraint (migration 0012). No rows use it. |
| `CategoryBadge.tsx` | Already has a purple "Geopolitical" style. |
| Federal Register sync | Already tracks OFAC (`foreign-assets-control-office`), BIS (`industry-and-security-bureau`), CBP. **All 26 rows land as `category: 'regulatory'`.** RULE/PRORULE only, so OFAC's SDN-designation *notices* ("Notice of OFAC Sanctions Actions") and presidential documents (sanctions/tariff executive orders, proclamations like Proclamation 11052 that a BIS rule references) are not ingested. |
| `match-relevance` | Takes the 200 newest `federal_register` rows, evaluates the 40 newest un-evaluated. **All 23 OFAC rows have zero relevance rows for every firm**: they're pushed out by EPA/HHS volume (427/187 rows) before they're ever evaluated. And if they were evaluated, it would be with a jurisdiction/sector prompt that can't reason about supply-chain location exposure. |
| Location profile data | Company `hq` (location), `operating_locations`, `supplier_locations` (added 4e5de94), legacy `regions`; firm `geographies`. **No company has `supplier_locations` filled in** (0 of 8 rows). |
| Fund → company relationship | **Does not exist.** No `fund_id` on `portfolio_companies`, no join table. The spec's indirect path ("the fund invests in Lumen") can't be expressed; neither can the rule "Harbor and Cedar do not receive the match solely because the same fund owns them." |
| Impact analysis (`_shared/impact.ts`) | Branches on `category === 'enforcement'`; anything else gets the rule-shaped prompt (obligations, effective dates). Needs a geopolitical branch. |
| `rematch-regulation` | Hard-refuses non-regulatory categories. |
| Dashboard | No category filter (roadmap item 6). Status badge is regulatory-only. |

## Candidate sources

Network note: this cloud container's egress policy blocks every `.gov` host
(curl, WebFetch: `ofac.treasury.gov`, `travel.state.gov`,
`www.federalregister.gov`, `ustr.gov`, `bis.gov` all return CONNECT 403).
Live feed shapes could not be pulled from here. The edge functions run on
Supabase and already reach the Federal Register, so that path is proven.

| Source | Covers | Shape | Verdict |
|---|---|---|---|
| Federal Register: OFAC + BIS RULE/PRORULE (already synced) | Sanctions regulations, general licenses, export-control rules, Entity List changes | Existing pipeline | **Reclassify as geopolitical.** No new connector. |
| Federal Register: OFAC NOTICE | SDN designations ("Notice of OFAC Sanctions Actions") | Same API, `type=NOTICE`, agency filter | **Add.** Moderate volume, the one official per-designation record. Same pattern as the existing FINRA NOTICE path. |
| Federal Register: PRESDOCU (executive orders, proclamations) | Sanctions programs (IEEPA emergencies), tariffs (Section 232/301 proclamations) | Same API, `type=PRESDOCU` | **Add**, keyword-filtered to trade/sanctions/emergency topics; presidential documents are otherwise mostly unrelated. |
| Federal Register: USTR (`trade-representative-office-of-united-states`) | Section 301 tariff actions | Same API | **Add** (RULE/PRORULE/NOTICE). Volume needs a check. |
| State Dept travel advisories, `travel.state.gov/_res/rss/TAsTWs.xml` | Country-level political disruption (levels 1–4, coups, unrest) | RSS, one item per country, title carries the country | **Add.** The only official political-disruption source, and country-tagged, so the free location pre-filter works perfectly. Shape confirmed via search, not fetched. |
| OFAC SDN list (XML/CSV) | Full designated-persons list | ~10MB bulk file | **Defer.** That's name screening; the spec explicitly warns against similar-name identity claims. Not a feed of developments. |
| GDELT / news APIs | General events | — | **Reject for Phase 1.** Spec: "should not become a general world news page"; not official. |

## Matching design (what's different from regulatory/enforcement)

1. **Affected countries extracted at ingest.** A new `regulations.countries
   text[]` column, filled by a deterministic gazetteer (country names plus
   demonyms: "Iranian" → Iran, "Russian Harmful Foreign Activities" →
   Russia) in a shared module. Travel advisories carry the country in the
   title. Empty = global/unspecified measure (e.g. a tariff on all imports).
2. **Free pre-filter before any AI call.** Per firm, build the set of
   countries the firm/companies touch (HQ, operating, supplier locations,
   regions, firm geographies). Keep an item only if its countries
   intersect that set, or it's global *and* some company has a non-US
   footprint or recorded suppliers. Most items drop here, so cost scales
   with relevant items, not feed volume.
3. **Separate matcher** `match-geopolitical-relevance`, the same split the
   codebase already made for enforcement. Its prompt needs the
   connection type (facility / operations / supplier / HQ) and the
   relationship path, and must forbid "is sanctioned" or "is prohibited"
   language and say when supplier data is missing. Reuses
   `_shared/relevance.ts` (auth, rate limit, entity load, row upsert).
4. **Impact analysis branch** for geopolitical in `_shared/impact.ts`: what
   happened, which profile location connects, direct vs. indirect, what's
   unknown, with obligations forced empty (same idea as the enforcement
   branch).

## Blockers and decisions

1. **Fund → company holdings don't exist.** The fund-level indirect path
   needs a `fund_holdings (fund_id, portfolio_company_id)` table plus UI.
   Phase 1 can ship company and firm matches without it; fund matches wait
   for the link. The alternative of guessing ownership is explicitly
   forbidden by spec §3.
2. **Source verification.** Codebase norm is "verify real volume and shape
   before building." From this container that's only possible by deploying
   a function and invoking it on Supabase, or by widening the
   environment's network policy.
3. **No supplier data entered** for any company, so supplier-path matches
   can't be demoed yet. Operating locations exist (Germany, UK, France,
   India, Italy), so country matching is testable today.

## Proposed implementation phases

- **Phase 1 (this pass):** migration (`countries` column, new sources in
  the source check); shared country gazetteer;
  Federal Register sync emits `category: 'geopolitical'` for OFAC/BIS/USTR
  and adds OFAC NOTICE and filtered PRESDOCU; new `sync-travel-advisories`
  function + cron; `match-geopolitical-relevance` with pre-filter;
  geopolitical branch in `impact.ts`; frontend source labels and types.
- **Phase 2:** fund holdings UI + fund-level indirect matches; category
  filter on entity pages (roadmap item 6); `rematch-regulation` for
  geopolitical.
- **Phase 3:** OFAC Recent Actions / SDN-list deltas, UK/EU sanctions
  (OFSI, EU consolidated list), once Phase 1 proves the pipeline.
