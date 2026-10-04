# Category filter and search on entity pages — implement

Follows `prompts/entity-feed-filter-investigate.md` (same prompt). Built as
planned, client-side.

## What was built

| Piece | Where |
|---|---|
| `MatchedRegulation` (a regulation plus that entity's own `match_reason`); `fetchRelevantRegulations` keeps the reason instead of dropping it | `src/lib/types.ts`, `src/lib/data.ts` |
| Pure filter logic: categories, date windows, `locationsOf` (geopolitical → countries or "Global"; U.S. federal jurisdictions → "United States (federal)"; else as written), per-category counts under the other filters, `applyFeedFilter` | `src/lib/feedFilter.ts` (new) |
| Filter bar (category chips with counts, topic search, date window, location from the list being viewed, Clear filters), item card, empty/no-match states | `src/components/EntityFeed.tsx` (new) |
| Item card now shows the short description and "Why it's here" (2 lines each) and a labelled "Published" date | `src/components/EntityFeed.tsx` |
| Firm/fund/company lists are one component; filter kept across entities and navigation (`ui:feedFilter`) | `src/components/Dashboard.tsx` |
| `Chip` moved out of the questionnaire into a shared component | `src/components/Chip.tsx` |

## Verification

- `tsc` clean.
- Filter logic run over H.I.G.'s real per-entity matches (22 items, 3
  companies): category counts, multi-term search ("india section" → the
  Section 301 item on 3Pillar), date window, and location options per
  entity (e.g. 3Pillar: U.S. federal, India, the Section 301 economies,
  "Virginia, United States").
- Browser, as a throwaway user on a throwaway firm (deleted afterwards)
  with 11 seeded matches across all three categories: chips showed All 11 /
  Regulatory 7 / Enforcement 2 / Geopolitical 2; Geopolitical narrowed to 2
  with "Clear filters" shown; "United Kingdom" left 3; a nonsense search
  showed the no-match state with a reset link. Cards rendered description,
  "Published" date and "Why it's here".
- Not checked: phone width (the filter row collapses to one column below
  `sm`, untested visually).

## Left as is

- A company scan can write a bare "United States" jurisdiction, which
  stays separate from "United States (federal)": the source didn't say
  federal.
- `HeadlineDetailView`'s History toggle stays UI-only; it isn't this
  feature.
