# Implement: Fund selection page

You're working in the RegWay repo (`/Users/ulykbekkhairulla/dev/regpe`).
Use the findings from `docs/notes/25-fund-selection-investigate.md`: confirmed
`fetchFundRegulations` is only ever called from `Dashboard.tsx` (safe to
change its signature), `Fund` has no `logo_url` (cards are initials-only),
`FundsProfile.tsx`'s existing `EntityCard` uses `f.structure` as the
subtitle (reuse that same secondary line), a firm can have zero funds
(`removeFund` exists, `FundsProfile` already shows a "No funds yet." empty
state), and single-entity selection has no auto-select precedent anywhere
in this app (Portfolio Companies requires a click even with one company —
funds should match, not auto-expand).

## `src/lib/data.ts`

1. Change `fetchRelevantRegulations`'s filters type: add `fundId?: string`.
   In the `'fund'` branch, use `.eq('fund_id', filters.fundId)` when
   `fundId` is present, otherwise keep today's `.not('fund_id', 'is',
   null)` as the fallback.
2. Change `fetchFundRegulations` to `(firmId: string, fundId?: string) =>
   fetchRelevantRegulations({ firmId, scope: 'fund', fundId })`.

## `src/components/Dashboard.tsx`

3. Import `Fund` from `../lib/types` and `fetchFunds`, `getCachedFunds`
   from `../lib/data`.
4. Add state: `const [funds, setFunds] = useCachedState<Fund[]>('funds',
   [])` and `const [selectedFund, setSelectedFund] =
   useCachedState<string | null>('ui:selectedFund', null)` — same
   convention as `selectedCompany`.
5. In the firm-load effect (where `fetchPortfolioCompanies` is already
   called alongside the firm fetch), also call `fetchFunds(id)` and
   `setFunds` on the result, same `Promise.all` call Portfolio Companies
   already uses.
6. Change `fundRegs` to be keyed by fund id, same shape as `companyRegs`:
   `const [fundRegs, setFundRegs] = useCachedState<Record<string,
   Regulation[]>>('regs:fund', {})`.
7. Replace the "Refresh the open ... Fund Structure list" effect
   (`Dashboard.tsx:120-125`, the `if (activeToggle === 'fund')` line) with
   a fetch keyed by `selectedFund`, same pattern as the existing
   `selectedCompany` effect (`Dashboard.tsx:137-149`), minus the
   scanning/needsScan logic (confirmed not applicable to funds — fund
   regulations come from the regular match pipeline, never an on-demand
   scan): when `activeToggle === 'fund' && selectedFund`, call
   `fetchFundRegulations(firmId, selectedFund)` and store into
   `fundRegs[selectedFund]`.
8. Add a `selectFund` handler mirroring `selectCompany`:
   `setSelectedFund(selectedFund === fundId ? null : fundId)`.
9. Reset `selectedFund` to `null` in `selectToggle`, same as
   `selectedCompany` is already reset there.
10. In `dismiss()`, update the fund-regulation removal logic to match the
    new keyed shape (same pattern as the existing `companyRegs` removal:
    map over every fund's list and filter out the dismissed id), replacing
    the old flat `setFundRegs(without)` call.
11. Replace the `activeToggle === 'fund'` render block
    (`Dashboard.tsx:310-322`) with the Portfolio Companies pattern
    (`Dashboard.tsx:324-380`) adapted for funds:
    - If `funds.length === 0`: `EmptyState` with `"No funds on file yet."`
    - Otherwise, a horizontal card row identical in style to the company
      cards (`glass-card-light glass-lift`, `w-44`, selected-state ring),
      but initials-only (no `logo_url` branch — funds don't have one):
      `fund.name.split(' ').map(w => w[0]).join('').slice(0, 2)` for the
      avatar, `fund.name` as the title, and `fund.structure ?? 'Structure
      n/a'` as the secondary line (matching `FundsProfile.tsx`'s existing
      subtitle convention).
    - No "Researching…" state (funds have no scan concept).
    - Below the card row, when `selectedFund` is set: loading / empty /
      list states driven by `fundRegs[selectedFund]`, same three-way
      conditional Portfolio Companies already uses
      (`undefined` → "Loading…", `0` → "No regulations have been
      confirmed relevant to this fund yet.", otherwise the `HeadlineItem`
      list).

## Verify

- `pnpm exec tsc --noEmit`.
- Live in the browser: open the Fund Structure tab.
  - With a firm that has multiple funds: confirm a card row appears, no
    fund is auto-selected, clicking a card selects it (ring highlight) and
    loads that fund's regulations only — confirm a different fund's card
    shows a different (or empty) list, proving the filter is actually
    fund-scoped and not still the old aggregated query.
  - Dismiss a regulation from within a fund's list and confirm it's
    removed from that fund's cached list without affecting other funds'.
  - Remove funds down to zero (or use/create a test firm with none) and
    confirm the "No funds on file yet." empty state renders instead of an
    empty card row.
  - Navigate to a headline detail from a selected fund's list and back;
    confirm the same fund is still selected (cache survives navigation,
    matching `selectedCompany`'s existing behavior).
