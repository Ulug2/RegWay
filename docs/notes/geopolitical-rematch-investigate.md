# Re-check ("This match looks wrong?") for geopolitical items — investigate

Roadmap: `plans/regway-mvp-roadmap.md` → Priority order item 1.1
(geopolitical monitoring, Phase 2).

## Prompt

> Okay work on the next thing

(Following `geopolitical-phase1-recheck-*.md` and `fund-holdings-*.md`; the
next item on the roadmap was `rematch-regulation` for geopolitical.)

## What exists today

| Piece | State |
|---|---|
| `rematch-regulation` | Returns 400 for any category but `regulatory`. Its prompt is an inline copy of the regulatory matcher's rules. |
| Geopolitical rules | Prompt (`INSTRUCTIONS`), candidate formatting, footprints and tool schema all live inside `match-geopolitical-relevance/index.ts`, so nothing else can judge a geopolitical item by the same rules. |
| Verdict write | Keeps only `verdicts[0]` and **upserts** it. The drawer passes no entity, so the re-check is firm-wide, but the firm's other rows for the regulation are never replaced: if a company row was the wrong match and the new verdict is firm-level "not relevant", the company row stays live and the item keeps showing on that company's page. Latent: the only two production re-checks (2026-10-02, H.I.G.) were firm-level, and no regulation has contradictory rows today (checked). |
| Fund rows | Geopolitical fund rows are derived from holdings (`_shared/holdings.ts`); a re-check that changes a company verdict has to re-derive them. |
| Frontend | `HeadlineDetailView` shows the button only for `category === 'regulatory'`; the result shows one reason. |

## Plan

1. `_shared/geopoliticalJudge.ts`: the geopolitical verdict step (prompt,
   candidate line, tool schema, model call, company-name guard, skipped
   markers), used by both the matcher and the re-check, with an optional
   user correction appended outside the cached prefix.
2. `_shared/relevance.ts` → `replaceRegulationVerdicts`: delete the firm's
   rows on the regulation that the new verdict set doesn't produce, then
   upsert. Dismissals and holdings-derived rows untouched. Used for both
   categories, which fixes the single-verdict bug for regulatory too.
3. `rematch-regulation`: route by category (regulatory prompt moved
   verbatim into a function; geopolitical via the shared judge), keep every
   verdict, re-derive fund rows for geopolitical, return per-entity
   verdicts. Enforcement still refused.
4. UI: button for geopolitical items; list per-entity verdicts when the
   re-check names more than one entity.
