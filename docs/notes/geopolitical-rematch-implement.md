# Re-check for geopolitical items — implement

Follows `docs/notes/geopolitical-rematch-investigate.md` (same prompt). Built as
planned.

## What was built

| Piece | Where |
|---|---|
| Shared geopolitical verdict step, optional user correction | `supabase/functions/_shared/geopoliticalJudge.ts` (new); `match-geopolitical-relevance/index.ts` now calls it |
| `replaceRegulationVerdicts` (replace, not just upsert; keeps dismissals and derived fund rows) | `supabase/functions/_shared/relevance.ts` |
| Category routing, all verdicts kept, fund rows re-derived, per-entity result | `supabase/functions/rematch-regulation/index.ts` |
| Service-role callers' bodies were consumed by `resolveFirmContext` (it read `req.json()`), so `rematch-regulation` and `refresh-entity-impacts` lost their own fields on that path; now reads a clone | `supabase/functions/_shared/relevance.ts` |
| Button for geopolitical items; per-entity verdict list | `src/components/HeadlineDetailView.tsx`, `src/lib/data.ts` |

## Verification

- Type-checked (Deno, all functions; `tsc` frontend). Deployed all functions.
- **Blocked on the AI step:** every live call returned Anthropic 400 "credit
  balance is too low", including the production matchers; no rows were
  written by the failed calls. The judge itself is the matcher's existing
  prompt, but the correction text and an end-to-end re-check are
  unverified until credits are topped up.
- **Everything after the AI step verified against the live DB** with a
  throwaway firm (deleted afterwards), running the same helpers
  `rematch-regulation` calls with the verdicts the model would return:
  - geopolitical, correction accepted: company row and derived fund row
    removed, one firm-level "not relevant" left;
  - regulatory, wrong company match: company row removed (the old code
    would have left it live beside the new marker);
  - re-check of a dismissed company row: stays dismissed;
  - flip back to relevant: firm marker replaced by the company row, fund
    row re-derived ("ZZ Test Fund I holds ZZ Test Aero Logistics, which
    has a direct connection: …").
- The service-role body fix confirmed live: the re-check got past input
  validation to the model call (it returned "regulationId is required"
  before).

## To re-run once credits are back

Throwaway firm as in the fund-holdings test, seeded rows, then
`POST /functions/v1/rematch-regulation {firmId, regulationId, note}` with the
`sb_secret_…` key (as `Authorization: Bearer` and `apikey`).
