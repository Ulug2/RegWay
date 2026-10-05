# Re-discovery after profile edits (roadmap item 11)

## Prompt

> Do the next thing

## Audit

| Edit | Before |
|---|---|
| Firm profile save | `refresh-entity-impacts` only (rewrites explanations of existing matches). No new matches. |
| Fund save / add fund | Same / nothing. |
| Company HQ, sectors, regions | Re-scan (company-regulations) + its rows cleared. |
| Company locations | Geopolitical `reevaluate` (forgets geopolitical rejections). |
| Company "what it does" | Nothing, though match-relevance's company lines read it. |

The regulatory and enforcement matchers only judge items with no row for
the firm, and store a `NOT_RELEVANT:` marker for every rejection, so a
rejection is permanent.

## Design

1. Client decides whether a save changed a fact the matchers read
   (`lib/matchingFacts.ts`), comparing the stored row normalised through
   the questionnaire (older rows keep facts in another shape).
2. If so: `match-relevance` and `match-enforcement-relevance` with
   `reevaluate: true` (+ geopolitical when the firm's location changed).
3. Server forgets only rejections on the matcher's own candidate window,
   never matches or dismissals; judges one batch now; sets
   `scheduled_matching_firms.requested_at` (migration 0030) so
   run-matching continues for enrolled firms.

## Found while testing

The first browser test showed an untouched location counted as changed:
the mock (like older real rows) had the HQ only in `hq_location`, while a
save writes `profile.hq` too. Fixed by normalising the stored row before
comparing.
