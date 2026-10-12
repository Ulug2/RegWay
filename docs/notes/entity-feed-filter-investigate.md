# Category filter and search on entity pages — investigate

Roadmap: `plans/regway-mvp-roadmap.md` → Priority order item 1.1 (pointing
at item 6, "Category filter on entity pages").

## Prompt

> Work on the next one

## What the spec asks (Regway_AI_Features_and_User_Journey.docx §4–5)

- "Users can view all matched developments together or narrow the list to
  regulatory developments, enforcement actions, or geopolitical
  developments."
- "Each list item shows a clear title, information category, source or
  issuing body, publication date, and a short factual description."
- "Each item also provides a short explanation of why it appears, such as
  'Matched because this company operates a facility in the affected
  region.'"
- "Basic search and filtering help the user locate an item by topic, date,
  category, or relevant location. These are supporting navigation tools,
  not additional monitoring products."
- "An item that is relevant to several entities can appear on several
  entity pages. Each appearance uses the explanation appropriate to the
  selected entity."

(The .docx is in Git LFS; `git lfs pull --include=docs/...` fetches it.)

## What exists today

| Piece | State |
|---|---|
| Lists | `Dashboard.tsx` renders the firm, fund and company lists as three copies of the same `map(HeadlineItem)` block. No filter, no search. |
| List item | Category badge, status badge, title, `jurisdiction ‖ agency`, and `effective_date ‖ published_date` with no label (a publication date can read as an effective date — the same bug fixed on the detail page in Phase 1). **No description, no "why it appears".** |
| Why it appears | `fetchRelevantRegulations` selects `relevance_reason` and then drops it, returning bare `regulations` rows. Each entity's own row carries its own reason (fund rows derived from holdings say "Indirect: Fund holds X, which …"), so keeping it gives the spec's per-entity explanation for free. Every live match has a reason (checked: 71 of 71). |
| Location data | Geopolitical rows: `countries[]` (empty = global). Regulatory/enforcement: free-text `jurisdiction` — "`<Agency>` · Federal", "Federal", "Federal (United States)" for U.S. federal; country/bloc names for company scans ("United Kingdom", "European Union"). `ai_search` rows never have `countries`. |
| Date | `published_date` on every source. |
| `HeadlineDetailView` History toggle | UI-only, not wired; out of scope (it's not this feature). |

## Plan

1. `fetchRelevantRegulations` returns each regulation with its entity's
   `match_reason`.
2. `src/lib/feedFilter.ts` (pure): filter state, `locationsOf(item)`
   (geopolitical → its countries or "Global"; U.S. federal jurisdictions →
   "United States (federal)"; otherwise the jurisdiction as written),
   category counts, date windows, and one `applyFeedFilter`.
3. `src/components/EntityFeed.tsx`: category chips with counts, topic
   search (title, summary, issuer, why), date window, location select
   (options from the list being viewed), the item card, and the
   "nothing matches these filters" state. The three dashboard lists become
   one component.
4. Item card gains the short description (2 lines), "Why it appears"
   (2 lines) and a labelled publication date.
5. Client-side only: an entity's list is tens of items, already loaded.
