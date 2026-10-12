# Implement: relevance-matching prompt tightening (roadmap items 6–7)

You're working in the RegWay repo (`/Users/ulykbekkhairulla/dev/regpe`). Use
the findings from `docs/notes/03-relevance-tightening-investigate.md` as the
source of truth. **Do not redo work that's already correct** — if the
investigation confirms the prompt is already tightened, deployed, and
verified, this becomes a verification-only pass: re-confirm the DB state
matches expectations and report it. Only make changes if the investigation
found something genuinely missing or weaker than the roadmap requires.

## If (and only if) the investigation found real gaps

1. Edit the prompt in
   `supabase/functions/match-relevance/index.ts` to add whatever specific
   rule is missing — e.g. explicit rejection of speculative language
   ("may have", "could be exposed to") and/or explicit rejection of purely
   administrative/procedural notices that create no new obligation.
2. `pnpm exec tsc --noEmit` to confirm no type errors.
3. `supabase functions deploy match-relevance`.
4. Clear existing `regulation_relevance` rows via psql so the next run
   re-evaluates from scratch (the function skips anything already
   evaluated, so a prompt change alone won't retroactively fix old verdicts).
5. Re-trigger `match-relevance` for every firm in the DB — via a `fetch`
   call from an authenticated browser session using `javascript_tool` (sign
   in as each test account if more than one firm exists), same pattern used
   earlier in this project.

## Verify (always run this, even if no changes were made)

- Query `regulation_relevance` per firm: report the relevant/not-relevant
  count and the exact reasoning text for the CFTC whistleblower item (or
  confirm it's absent because nothing currently matches that title).
- Confirm no regulation is marked relevant on speculative or purely
  administrative grounds — spot-check the reasoning text of every row
  currently marked relevant (not just the previously-broken one).
- Report a short before/after (or "already correct, here's proof") summary.
