# Geopolitical monitoring, including sanctions — implement (Phase 1)

Follows `prompts/geopolitical-monitoring-investigate.md`.

## Prompt

> Read the roadmap, start from the first priority task. Always use an audit
> then implement flow. Save prompts under prompts/. Write clean, organized
> and, most importantly, scalable code.

Decisions taken after the audit (asked and answered):
- Scope: full Phase 1. Federal Register geopolitical feeds plus State
  Department travel advisories, a dedicated matcher with a free location
  pre-filter, and a geopolitical impact analysis. Fund holdings deferred.
- Verification: deploy to the live Supabase project and test against real
  data, since this cloud container can't reach any `.gov` host.
- Prompts: commit them (removed `/prompts/` from `.gitignore`).

## What was built

| Piece | Where |
|---|---|
| `countries` column (GIN), `(category, published_date)` index, travel-advisory source, OFAC/BIS reclassified, daily cron | `supabase/migrations/0023_geopolitical_monitoring.sql` |
| Country gazetteer: free-text extraction + profile-location resolution | `supabase/functions/_shared/countries.ts` |
| Entity footprint: country + connection kind (HQ / facilities / operations / suppliers) + activity | `supabase/functions/_shared/footprint.ts` |
| Declarative Federal Register feeds; category + countries per row; `.txt` URL stored | `supabase/functions/sync-federal-register/index.ts` |
| State Department advisories (level 3-4) | `supabase/functions/sync-travel-advisories/index.ts` |
| Matcher: pre-filter → AI with precomputed overlaps; `reevaluate` | `supabase/functions/match-geopolitical-relevance/index.ts` |
| Per-category impact prompts (regulatory/enforcement verbatim + geopolitical) | `supabase/functions/_shared/impactPrompts.ts`, `_shared/impact.ts` |
| Shared fixes: relevance-row dedupe, RSS entity decoding | `_shared/relevance.ts`, `_shared/rss.ts` |
| `match-relevance` limited to `category = 'regulatory'` | `supabase/functions/match-relevance/index.ts` |
| Full country list, searchable tag input, triggers, labels, date-label fix | `src/lib/questionnaire.ts`, `src/components/TagInput.tsx`, `src/lib/data.ts`, `src/components/Dashboard.tsx`, `src/components/OnboardingModal.tsx`, `src/components/HeadlineDetailView.tsx`, `src/lib/types.ts` |

## How it scales

- **New source** = one `FEEDS` entry (Federal Register) or one small sync
  function writing `category: 'geopolitical'` + `countries`. The matcher
  and UI need no change.
- **Cost tracks relevance, not feed volume**: the location pre-filter is
  two indexed queries (`countries && footprint`, plus global items only
  when there's foreign exposure); a dashboard-load run with nothing new
  makes no AI call and doesn't consume rate limit.
- **New category** = one entry in `IMPACT_PROMPTS`.

## Verification (live, project cfspwaqtidfliupmlfwz)

See the roadmap's Completed entry "Geopolitical monitoring, Phase 1" for
numbers. In short, the first rule set over-matched (an SDN designee merely
located in Italy → A.L.A.), and the sector-blind footprint let "if it
exports these materials" through. Both were fixed and re-run from a clean
slate: 121 evaluated, 2 kept. One is solid (aircraft-parts Section 232 →
A.L.A.); one is a known residual false positive (Section 301 manufacturing
probe → 3Pillar via India).

## Tooling notes for the next session

- Edge functions type-check with Deno from npm plus an import map that
  points `https://esm.sh/@supabase/supabase-js@2.45.4` at
  `npm:@supabase/supabase-js@2.45.4` (esm.sh is blocked here).
- No Supabase CLI token in this container. Deploys went through the
  Supabase MCP connector, with file names mirroring the repo layout
  (`functions/<name>/index.ts`, `functions/_shared/*.ts`).
- Headless Chromium can't reliably reach supabase.co through the container
  proxy (`ERR_TOO_MANY_RETRIES`). Relaying Supabase requests through Node's
  `fetch` with Playwright's `page.route` (run with `NODE_USE_ENV_PROXY=1`)
  works.
