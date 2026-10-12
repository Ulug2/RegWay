# Investigate: relevance-matching prompt tightening (roadmap items 6–7)

You're working in the RegWay repo (`/Users/ulykbekkhairulla/dev/regpe`). This
is a **read-only investigation pass** — do not edit anything.

Context: `plans/regway-mvp-roadmap.md` items 6–7 called for tightening the
`match-relevance` prompt because a CFTC "Whistleblower Award Determination"
notice was wrongly marked relevant on speculative reasoning ("Meridian *may
have* CFTC-regulated activities"). **This may already be done** — check
before assuming it needs work.

## Steps

1. Read `supabase/functions/match-relevance/index.ts` in full and quote the
   current prompt text sent to Claude. Confirm whether it already contains
   language rejecting speculative connections ("may have", "could be exposed
   to") and purely administrative/procedural notices (award determinations,
   individual case outcomes, routine agency notices).
2. Check whether the deployed version matches the local source — deployed
   function version/timestamp can be seen via
   `supabase functions list` or the dashboard; at minimum confirm there's no
   uncommitted local change that hasn't been deployed.
3. Query the database to see the actual current state of
   `regulation_relevance`: for each firm, how many regulations are marked
   relevant vs. `NOT_RELEVANT:`, and specifically check whether the CFTC
   whistleblower item (search `regulations.title` for `%Whistleblower%`) is
   currently marked relevant or not, and read its `relevance_reason` text.
   Use the same psql connection pattern used earlier in this project
   (password in `.env.local` as `PROJECT_DB_PASSWORD`, pooler host
   `aws-0-us-west-2.pooler.supabase.com:6543`).
4. Check `git log` for a commit that already addresses this (search for
   "relevance" or "match-relevance" in commit messages/diffs) to confirm
   whether this was already shipped, and if so, in which commit.

## Output

State plainly: is this already done, partially done, or not done at all?
If already done, report the exact current prompt wording and the CFTC
item's current verdict as proof. If anything is missing or could be
stronger, say exactly what and where — don't silently redo work that's
already correct.
