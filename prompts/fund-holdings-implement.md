# Fund → company holdings — implement

Follows `prompts/fund-holdings-investigate.md` (same session prompt). Built
the design as audited, with the two defaults taken (no onboarding change;
regulatory/enforcement matchers untouched).

## What was built

| Piece | Where |
|---|---|
| `fund_holdings` (composite FKs to `(id, firm_id)` on both parents, RLS with `(select auth_firm_id())`); `regulation_relevance.via_holdings` | `supabase/migrations/0024_fund_holdings.sql` |
| Covering indexes for the composite FKs (performance advisor) | `supabase/migrations/0025_fund_holdings_fk_indexes.sql` |
| Derived fund rows: recompute per firm + category; returns still-matched regulations whose fund rows changed | `supabase/functions/_shared/holdings.ts` |
| Matcher: evaluation extracted to `evaluateNew`; rollup runs on every call (also when rate limited); fresh matches get analyses, changed fund rows force-regenerate; prompt says fund exposure is derived | `supabase/functions/match-geopolitical-relevance/index.ts` |
| Fund lines in the analysis name what the fund holds; geopolitical prompt writes the fund → company → location path and never links siblings | `supabase/functions/_shared/impact.ts`, `_shared/impactPrompts.ts` |
| `FundHolding` type; `fetchHoldings`, `setHolding` (triggers the matcher) | `src/lib/types.ts`, `src/lib/data.ts` |
| "Which of your funds hold this company?" picker and fund-side summary; `null` = loading, so "Not recorded" is never flashed | `src/components/profile/FundHoldings.tsx`, `CompaniesProfile.tsx`, `FundsProfile.tsx` |
| `EntityCard` `extra` slot for relationship controls; `Chip` exported for reuse | `src/components/profile/EntityCard.tsx`, `src/components/questionnaire/QuestionField.tsx` |

## Verification

See the roadmap's Completed entry "Fund → company holdings". In short:
throwaway firm (deleted afterwards), one fund holding an Italian aerospace
company and a U.S.-only sibling; derived fund rows appeared for exactly the
company's 2 matches, none for the sibling; rewording, removal and no-op
paths behaved; the fund's analysis wrote the path; composite FK and RLS
refused cross-firm access; the picker, fund card and dashboard Fund tab
worked in a real browser session. One UI bug found and fixed on the way:
the fund card showed "Not recorded" until holdings loaded.

## Tooling notes

- Migrations: `POST /v1/projects/<ref>/database/migrations` with
  `{name, query}` applies and records them like the MCP `apply_migration`.
- Service-role calls to functions that compare the bearer token need the
  `sb_secret_…` key (`supabase projects api-keys --reveal`), sent as both
  `Authorization: Bearer` and `apikey`.
- Browser checks: `.env.local` (gitignored) with the URL and anon key,
  `pnpm exec vite --port 8443`, Playwright from `npm root -g` with
  `executablePath: /opt/pw-browsers/chromium-1194/chrome-linux/chrome`, and
  Supabase requests relayed through Node `fetch` (`NODE_USE_ENV_PROXY=1`).
