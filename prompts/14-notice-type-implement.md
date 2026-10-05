# Implement: targeted FINRA notice inclusion (not blanket NOTICE type)

You're working in the RegWay repo (`/Users/ulykbekkhairulla/dev/regpe`). Use
the findings from `prompts/13-notice-type-investigate.md`:

**Do not blanket-add NOTICE type** to the existing 15-agency query — real
numbers show ~6,083 items in 9 months (~154/week, a 6-7x volume increase),
mostly administrative/procedural noise that `match-relevance`'s prompt was
just tightened to reject, and would take a very long time to classify
under the new 15/hour rate limit.

**The API's `conditions[term]` is not a precise entity filter** — even an
exact quoted phrase ("Financial Industry Regulatory Authority, Inc.") only
matched the actual subject in ~45% of results; the rest were other
exchanges' filings that merely reference FINRA in body text. Don't rely on
it for precision.

**The reliable approach**: fetch all SEC NOTICE-type documents (no term
filter — manageable volume, ~7/day normally, ~1,912 in a 9-month test
window, fits within the existing 20-page pagination cap) and filter
**client-side by title** containing `"Financial Industry Regulatory
Authority"` — Federal Register's SRO notice titles consistently follow the
pattern `"Self-Regulatory Organizations; <SRO Name>; <action>"`, so this
substring check reliably isolates genuine FINRA-subject documents (~57 in
9 months in the sample checked, ~1.5/week — comparable in scale to a single
tracked agency's normal RULE/PRORULE volume).

## Steps

1. In `supabase/functions/sync-federal-register/index.ts`, generalize the
   existing pagination `while` loop into a reusable async function/closure
   that takes a params-building function (or a plain query-config object:
   agencies, types, extra conditions) and returns the accumulated
   `FederalRegisterDocument[]`, so the same loop logic isn't duplicated.
2. Call it twice:
   - The existing query: 15 tracked agencies, `RULE`+`PRORULE`.
   - A new query: `securities-and-exchange-commission` only, `NOTICE` type,
     same `since`/`order`/`per_page` pattern, no term filter.
3. Filter the second query's results to only documents whose `title`
   includes `Financial Industry Regulatory Authority` before merging with
   the first query's results into the combined `documents` array that
   feeds the existing `rows`/upsert logic. Keep the `primaryAgency()`
   labeling logic as-is — SEC-filed FINRA notices should still label
   correctly (spot-check this, since these documents likely list SEC as
   `agencies[0]` already, unlike the Treasury-bureau case that needed the
   fix).
4. Update the response JSON and the function's header comment to reflect
   the two-query approach and the FINRA-specific filter, so a future reader
   understands why NOTICE-type documents appear at all despite the type
   filter being RULE/PRORULE-only in the main query.

## Verify

- `pnpm exec tsc --noEmit`.
- Deploy: `supabase functions deploy sync-federal-register`.
- Trigger with a wide `?since=` (matching the 9-month window already used
  for other verification passes) and confirm the response/DB shows a
  reasonable number of new FINRA-titled items (expect roughly the ~57
  ballpark from the investigation, not thousands).
- Query `regulations` via psql: confirm new rows exist with titles
  containing "Financial Industry Regulatory Authority", confirm their
  `agency`/`jurisdiction` label correctly (not misattributed), and confirm
  the total row count increase is modest (tens, not thousands) — if it's
  in the thousands, the title filter isn't working and needs to be fixed
  before calling this done.
- Re-run a normal-window sync afterward and confirm typical daily volume
  stays small (a handful of items at most, not a regression back toward
  blanket-NOTICE volume).
