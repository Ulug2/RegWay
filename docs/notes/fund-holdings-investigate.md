# Fund → company holdings — investigate

Roadmap: `plans/regway-mvp-roadmap.md` → Priority order item 1.1
(geopolitical monitoring, Phase 2). Same session prompt as
`geopolitical-phase1-recheck-investigate.md`, step 3:

> Then continue with roadmap item 1's remaining Phase 2 work, starting with
> fund → company holdings.

Spec: §3 (never guess ownership), §9 and §13 (Lumen example: "the fund
invests in Lumen, which has a supplier in Region C" is an indirect fund
exposure; "Harbor and Cedar do not receive the match solely because the
same fund owns them").

## What exists today

| Piece | State |
|---|---|
| Schema | `funds` and `portfolio_companies` each hang off `firm_id` only. No `fund_id`, no join table, nothing in `profile` jsonb. |
| Questionnaire | Company question `ownership` asks "What ownership position does **your fund** have?", but never which fund. Options are static `string[]`; values are what's stored, so a fund picker inside the registry would store fund names in `profile` jsonb (a second, rename-fragile source of truth) and count toward completion. |
| Company card | `EntityCard` already has a company-only control that saves on its own, outside the questionnaire (logo upload). |
| Dashboard Fund tab | `fetchFundRegulations` reads `regulation_relevance` rows with that `fund_id`. Any fund-level row shows up with no dashboard change. |
| `match-geopolitical-relevance` | Prompt forbids `fund` scope ("holdings are not recorded"). Company verdicts are written with `portfolio_company_id`. |
| `match-relevance` / `match-enforcement-relevance` | Ask the AI for fund verdicts directly from the fund's own profile (structure, domicile). Not touched here. |
| `_shared/impact.ts` | Lists every linked fund as `FUND — name: facts`; has no idea a fund's link is through a company. |
| `regulation_relevance` unique key | `(regulation_id, firm_id, portfolio_company_id, fund_id)` NULLS NOT DISTINCT, so one fund row per regulation. |
| Test data | H.I.G. Capital: 2 funds, 3 companies, no holdings recorded (none can be: no table). |

## Design

1. **`fund_holdings (fund_id, portfolio_company_id, firm_id)`**, many-to-many
   (co-investments and continuation funds put one company in several
   funds). Composite FKs to `funds (id, firm_id)` and
   `portfolio_companies (id, firm_id)` so a holding can never cross firms,
   whatever the caller sends; RLS = the firm's members, same as the parent
   tables. Cascades on fund/company delete.
2. **UI**: a "Held by" fund picker on each company card (chips, saves on
   toggle, like the logo), with "Not recorded" when empty: unknown, not
   "no fund". Fund cards show which companies they hold. Not part of the
   questionnaire registry or completion count.
3. **Fund-level geopolitical matches are derived, not asked.** The fund's
   exposure is exactly "a company it holds has a supported connection", so
   it's computed from the company verdicts plus holdings, with no AI call
   and no chance of the model inventing ownership. A `via_holdings` flag
   on `regulation_relevance` marks these rows so they can be recomputed
   (added, rewritten, removed) whenever holdings or company verdicts
   change. Siblings get nothing (spec §13): only the fund row is added.
   The helper lives in `_shared/relevance.ts` and takes a category, so
   regulatory/enforcement can opt in later.
4. Recompute runs at the end of every geopolitical matcher run (including
   no-op runs, cheap: three indexed queries) and after a holdings edit.
5. `impact.ts`: a fund line names the companies it holds, so the analysis
   can write the relationship path ("Fund I → A.L.A. → Italy").

## Open decisions (defaults taken)

- Onboarding creates the first fund and first company together, but
  doesn't ask whether one holds the other. Auto-linking would be guessing
  (§3); asking adds a signup step. Default: no onboarding change; the
  company card shows "Not recorded" until set.
- Direct AI fund verdicts in the regulatory/enforcement matchers stay as
  they are.
