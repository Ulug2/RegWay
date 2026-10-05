# Implement: expand the `sync-federal-register` agency list

You're working in the RegWay repo (`/Users/ulykbekkhairulla/dev/regpe`). Use
the findings from `prompts/09-agency-list-investigate.md`:

**Add** (confirmed real slugs, meaningful recent RULE/PRORULE volume,
relevant titles): Federal Reserve (`federal-reserve-system`), OCC
(`comptroller-of-the-currency`), FDIC
(`federal-deposit-insurance-corporation`), FinCEN
(`financial-crimes-enforcement-network`), FTC
(`federal-trade-commission`), NLRB (`national-labor-relations-board`).

**Do not add**: `treasury-department` (the generic parent — 157 items in 9
months, mostly duplicate tagging of the same joint OCC/FDIC/Fed rules plus
irrelevant noise; redundant once the specific bureaus are tracked directly)
and `antitrust-division` (0 RULE/PRORULE items in 9 months — DOJ antitrust
activity is enforcement actions, not codified rules, so it yields nothing
under this pipeline's current type filter; revisit if/when NOTICE-type
documents get included, a separate already-planned roadmap item).

## Steps

1. Edit `AGENCY_SLUGS` in
   `supabase/functions/sync-federal-register/index.ts`: add the 6 new
   slugs. Update the comment above the array to reflect the fuller
   rationale (financial services regulators, labor law, competition) rather
   than the original vague "agencies most relevant" line, and briefly note
   in a comment why `treasury-department` and `antitrust-division` were
   evaluated but excluded, so a future reader doesn't wonder if they were
   simply forgotten.
2. `pnpm exec tsc --noEmit`.
3. Deploy: `supabase functions deploy sync-federal-register`.
4. Trigger a sync (use a window wide enough to actually pull real data from
   the new agencies for verification — the existing default 7-day window is
   fine if recent volume supports it, otherwise pass `?since=` further
   back, matching the same approach used to verify pagination).

## Verify

- Query `regulations` via psql grouped by `agency`, confirm rows now exist
  for the 6 newly added agencies (not just the original 9), and confirm no
  rows appear for the two excluded candidates (sanity check that nothing
  accidentally pulled them in via cross-tagging).
- Spot-check 2-3 titles from the new agencies to confirm they're
  substantive rules, not procedural noise.
- Report total row count and per-agency breakdown before/after, same format
  used in prior verification passes.
