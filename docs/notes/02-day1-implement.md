# Implement: Day 1 quick fixes + relevance prompt tightening

You're working in the RegWay repo (`/Users/ulykbekkhairulla/dev/regpe`). Use
the punch list produced by `docs/notes/01-day1-investigate.md` as the source of
truth for exact edits. If that investigation hasn't been run yet, run it
first — do not guess at line numbers or duplicate occurrences from memory.

## Apply, in order

1. Remove the duplicated AI summary paragraph in
   `src/components/HeadlineDetailView.tsx`, keeping only the one inside
   "Context & Overview".
2. Remove the "Regulatory Diff" and "Operational Implication Breakdown"
   blocks from the same file, plus any now-unused imports/variables the
   investigation flagged.
3. Remove `'Recent Shifts'` from `DATE_MODES`, and remove any logic branch
   that only existed for it.
4. Fix `© 2025` → `© 2026` everywhere the investigation found it.
5. Rebrand `LexPulse` → `RegWay` at every location the investigation listed
   — UI strings, `index.html`, `README.md`, the migration header comment,
   and `package.json`'s `"name"` field (`lexpulse` → `regway`). Do not touch
   "Harvey AI" or anything the investigation flagged as unrelated.
6. Tighten the `match-relevance` system/user prompt in
   `supabase/functions/match-relevance/index.ts`: add the explicit rule that
   speculative or hypothetical connections ("may have", "could be exposed
   to") must be marked **not relevant** — only a concrete, name-able
   connection to a listed jurisdiction, fund structure, or portfolio company
   sector counts as relevant. Insert it so it reads naturally with the
   existing strictness instruction rather than duplicating it.

## Deploy + reset + re-run

7. Redeploy the function: `supabase functions deploy match-relevance`.
8. Using the exact DELETE the investigation worked out, clear existing
   `regulation_relevance` rows so the next run re-evaluates with the
   stricter prompt (scope this to what the investigation recommended — all
   firms unless it found a reason to limit to one).
9. Re-trigger `match-relevance` for the test firm(s) the same way it was
   triggered earlier in this project (a `fetch` call from within the browser
   session using the signed-in user's token via `javascript_tool`, or the
   service-role path if no browser session is available) and confirm the
   CFTC whistleblower item (or anything else previously marked relevant on
   speculative grounds) is now excluded.

## Verify

- `pnpm exec tsc --noEmit` passes with zero errors after steps 1–6.
- The dev server (already running at `localhost:8443`, restart only if
  needed) still loads; click through: dashboard → a headline → confirm no
  duplicated summary, no Regulatory Diff / Operational Implication
  Breakdown sections, History control shows only "Today's Status" /
  "Custom Range", footer shows © 2026, and all visible brand text reads
  "RegWay".
- Query `regulation_relevance` via psql (same connection pattern used
  earlier) to confirm row counts before/after the re-run and spot-check that
  the previously-wrong verdict is now correct.
- Report back a short summary of what changed and the before/after relevance
  verdict for the item that was previously mis-classified.
