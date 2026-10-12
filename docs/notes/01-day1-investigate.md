# Investigate: Day 1 quick fixes + relevance prompt tightening

You're working in the RegWay repo (`/Users/ulykbekkhairulla/dev/regpe`). This
is a **read-only investigation pass** — do not edit anything. The goal is to
turn the roadmap items below (from `plans/regway-mvp-roadmap.md`) into a
precise, verified punch list that a follow-up implementation prompt can
execute without re-deriving context.

## Items to investigate

1. **Duplicated AI summary** — `src/components/HeadlineDetailView.tsx` is
   claimed to render `headline.summary` twice (once under the title, once in
   "Context & Overview"). Confirm both locations with exact line numbers and
   surrounding code, and confirm they really are the same value rendered
   twice (not two different fields that look similar).

2. **Fake deep-dive sections** — confirm the exact boundaries (start/end
   lines) of the "Regulatory Diff" and "Operational Implication Breakdown"
   JSX blocks in the same file, and check whether removing them leaves any
   dangling wrapper `<div>`s, unused imports, or unused local variables
   behind (e.g. unused `useState` hooks, helper arrays only used by those
   sections) that should be cleaned up in the same pass.

3. **"Recent Shifts" removal** — confirm `DATE_MODES` and every place
   `dateMode` / `DATE_MODES` is referenced in the file, so the edit doesn't
   leave orphaned logic (e.g. a branch that only fires when
   `dateMode === 'Recent Shifts'`).

4. **Copyright year** — confirm the exact two lines in `Dashboard.tsx` and
   `HeadlineDetailView.tsx`. Also grep the whole `src/` tree and `README.md`
   for any other `2025` occurrences that look like a copyright/year string
   (not, e.g., part of an unrelated number) that the roadmap missed.

5. **Rebrand LexPulse → RegWay** — grep the entire repo (not just the files
   the roadmap listed) for `LexPulse` and `lexpulse`, case-sensitive and
   case-insensitive, including `package.json`, `index.html`,
   `supabase/migrations/*.sql`, and any Supabase Edge Function source (check
   whether any function ever references the app name in a prompt sent to
   Claude, e.g. in `harvey-chat` or `match-relevance` system prompts — if so
   that's user-facing-ish and worth flagging even though the roadmap didn't
   call it out). List every file + line, and distinguish "app brand name,
   should become RegWay" from anything that should NOT change (e.g. if
   "Harvey AI" or an unrelated product name is nearby, don't lump it in).

6. **`match-relevance` prompt tightening** — read
   `supabase/functions/match-relevance/index.ts` in full and quote the exact
   current prompt text sent to Claude (the `content` template string in the
   `messages` array). Identify precisely where to insert the new
   "speculative connections must be marked not relevant" rule so it reads
   naturally alongside the existing "Be strict..." sentence, without
   duplicating instructions already there.

7. **Clearing existing relevance rows for re-evaluation** — confirm the
   `regulation_relevance` table schema (already in
   `supabase/migrations/0001_init.sql`) and figure out the exact SQL needed
   to delete existing rows so `match-relevance` re-evaluates from scratch.
   Also check how many firms currently exist in the DB (via the same psql
   connection pattern used earlier in this project — connection string in
   `.env.local` as `PROJECT_DB_PASSWORD`, pooler host
   `aws-0-us-west-2.pooler.supabase.com:6543`) so the implementation prompt
   knows whether to scope the DELETE to one test firm or all firms.

## Output

Produce a concise, numbered punch list (one entry per item above) giving the
**exact** old-string → new-string (or exact SQL / exact grep results) needed,
so the implementation pass is mechanical. Flag anything that deviates from
what the roadmap assumed (e.g. a line number that's off, an occurrence the
roadmap missed, or a case where "remove" would break something else) rather
than silently fixing it — surface it for a decision.
