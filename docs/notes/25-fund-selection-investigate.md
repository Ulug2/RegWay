# Investigate: Fund selection page

Roadmap item: "Partial — needs rework, not new build" #1 — fund selection
page. Doc wants "if the customer has several funds, the user first selects
the fund" with a per-fund page, same pattern Portfolio Companies already
has. Confirmed this session by reading the current code:

## Current state (the gap)

- `Dashboard.tsx`'s three-button toggle bar has `'fund'` as one of three
  `Toggle` values (`'pe' | 'fund' | 'portfolio'`). When `'fund'` is active,
  it renders one flat list: `fundRegs` fetched via
  `fetchFundRegulations(firmId)` (`src/lib/data.ts:105`), which calls the
  shared `fetchRelevantRegulations({ firmId, scope: 'fund' })`. That
  function's `'fund'` branch (`data.ts:49-50`) only does
  `.not('fund_id', 'is', null)` — **aggregated across every fund**, no
  per-fund filter exists today, unlike `scope: 'company'` which already
  takes a `companyId` and does `.eq('portfolio_company_id', companyId)`.
- The Portfolio Companies tab (`Dashboard.tsx:324-380`) is the exact
  pattern to replicate: a horizontal row of company cards (logo/initials,
  name, sectors), `selectedCompany` state toggled on click, and a
  drill-down regulation list keyed by company id
  (`companyRegs[selectedCompany]`). Fund Structure has no equivalent —
  just the flat list, no fund cards, no `selectedFund` state.
- `fetchFunds(firmId)` / `getCachedFunds()` already exist in `data.ts`
  (lines 116-128) and are already used elsewhere (confirm where — likely
  `FundsProfile.tsx` or `OnboardingModal.tsx`) to list a firm's funds. The
  `Fund` type (`src/lib/types.ts:12-21`) has `name`, `size`, `structure`,
  `jurisdictions`, `profile`, `profile_updated_at` — **no `logo_url`**
  field (unlike `PortfolioCompany`), so fund cards should render
  initials-only, never attempt a logo image.
- Portfolio Companies' drill-down also handles an active AI web-search scan
  per company (`isScanning`/`needsScan`/`scanCompany` from
  `src/lib/scans.ts`, showing a "Researching…" state). Confirmed
  `scans.ts` has no fund-related code at all — fund regulations come
  entirely from the regular sync+match pipeline
  (`match-relevance`/`match-enforcement-relevance` already assign
  `fund_id` per verdict in `_shared/relevance.ts`'s `buildRelevanceRows`),
  not an on-demand per-fund scan. The fund drill-down therefore needs
  **no scanning/researching state** — just a straight fetch scoped to
  that fund's `regulation_relevance` rows.
- `Dashboard.tsx` doesn't import `Fund` or hold any funds state today —
  this is new state, not a rename of something existing.

## Steps

1. Confirm where `fetchFunds`/`getCachedFunds` are currently called from
   (grep the repo) and confirm their shape matches what a Dashboard fund
   card needs (name, structure, jurisdictions at minimum — same fields
   `PortfolioCompany` cards show: name + a secondary descriptor line).
2. Confirm the exact `fetchRelevantRegulations` signature change needed:
   add an optional `fundId?: string` to the filters object, and in the
   `'fund'` branch, do `.eq('fund_id', filters.fundId)` when `fundId` is
   given, falling back to today's aggregated `.not('fund_id', 'is', null)`
   when it isn't (so nothing currently depending on the aggregated form
   breaks — confirm nothing besides `Dashboard.tsx`'s `'fund'` tab calls
   `fetchFundRegulations` before deciding whether the aggregated fallback
   is even still needed, or whether every caller can be migrated to
   fund-scoped).
3. Confirm how `useCachedState` keys work (`'ui:selectedCompany'` pattern)
   so a new `'ui:selectedFund'` key follows the same convention and
   survives navigating to a headline detail and back, matching
   `selectedCompany`'s existing behavior exactly.
4. Decide the single-fund case: if a firm has exactly one fund, does the
   doc's "if the customer has several funds" wording imply the selector
   should be skipped and that one fund auto-selected/auto-expanded? Check
   how Portfolio Companies currently behaves with exactly one company
   (does it auto-select, or still require a click?) and match that
   existing precedent rather than inventing new behavior — confirm by
   reading `Dashboard.tsx`'s portfolio-tab code again: today a single
   company still requires a click to select (no auto-select exists). Fund
   selection should match this unless there's a clear reason not to.
5. Confirm empty-state wording precedent (`EmptyState` component,
   `Dashboard.tsx:58-64`) to reuse exactly, and confirm zero-funds state:
   does the app currently let a firm exist with zero funds (check
   onboarding flow / `removeFund`)? If so, the Fund Structure tab needs a
   "no funds on file yet" empty state, same as Portfolio Companies'
   "No portfolio companies on file yet."

## Output

Confirmed `fetchRelevantRegulations`/`fetchFundRegulations` signature
change, confirmed `Fund` fields available for the card UI, confirmed
single-fund/zero-fund behavior to match existing precedent, and a concrete
component plan (state, card rendering, drill-down) ready to implement.
