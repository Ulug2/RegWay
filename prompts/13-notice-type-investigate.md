# Investigate: NOTICE-type Federal Register documents

You're working in the RegWay repo (`/Users/ulykbekkhairulla/dev/regpe`). This
is a **read-only investigation pass** — do not edit anything yet, but you
may make read-only `curl`/HTTP calls to the public Federal Register API.

Context: `plans/regway-mvp-roadmap.md`, "Fix real US regulation coverage,"
item 1. The stated motivation is narrow: FINRA rule approvals get published
as SEC Federal Register *notices*, not rules, so they're currently invisible
to a pipeline that only pulls RULE/PRORULE. The roadmap item as originally
phrased ("Include NOTICE type documents, not just RULE/PRORULE") sounds like
a blanket type-filter flip — **confirm with real numbers whether that's
actually the right implementation before building it.**

Real numbers already gathered this session (verify these still hold, don't
just trust stale figures):
- RULE+PRORULE across our 15 tracked agencies: ~918 in 9 months (~16/week).
- NOTICE across the same 15 agencies, same window: ~6,083 (~154/week) — a
  ~6-7x volume increase if blanket-added.
- SEC NOTICE alone, 9 months, no filter: ~1,912.
- SEC NOTICE + term "self-regulatory organization": ~1,430 — still huge,
  because it captures every exchange's routine filings (Nasdaq, Cboe, NYSE,
  LCH, etc.), not just FINRA specifically.
- SEC NOTICE + term "Financial Industry Regulatory Authority": ~362 (~9/
  week) — comparable in scale to existing RULE/PRORULE volume, genuinely
  targeted.

## Steps

1. Re-verify these numbers are still accurate (the API is live data, could
   have shifted slightly) and spot-check 5-10 actual titles from the
   FINRA-narrowed query for real substantive relevance (not just fee
   schedule technicalities) to a PE/GP audience — e.g. member-firm
   obligations, not niche market-structure filings only relevant to the
   exchange itself.
2. Consider whether a blanket NOTICE-type inclusion is worth its cost given
   these numbers: at BATCH_SIZE=40 per `match-relevance` call and the new
   15/hour rate limit, work out roughly how long a backlog of ~6,083 items
   would take to classify (do the arithmetic), versus the FINRA-narrowed
   ~362. Also consider that NOTICE content skews toward purely
   administrative/procedural documents — exactly the category
   `match-relevance`'s prompt was just tightened to reject — meaning much
   of a blanket NOTICE sync would be Claude API spend on things that get
   classified `NOT_RELEVANT` anyway.
3. Read `supabase/functions/sync-federal-register/index.ts` in full and
   work out how to add a second, narrow, separate query (SEC + NOTICE type
   + `conditions[term]=Financial Industry Regulatory Authority`) alongside
   the existing RULE/PRORULE query, reusing the existing pagination loop
   rather than duplicating it — e.g. generalize the loop into a helper that
   takes a params-builder and is called twice, merging both result sets
   before the existing upsert step.
4. Check whether `conditions[term]` needs URL-encoding considerations or
   quoting behavior worth knowing about (the term has spaces and this is a
   named-entity phrase, not a single keyword) — confirm via a live call
   that the exact phrase match works as expected (not an OR-of-words
   match that would broaden results unexpectedly).

## Output

A clear recommendation: blanket NOTICE inclusion (with the real cost this
implies, if you think it's still worth it despite the numbers) vs. the
narrow FINRA-specific second query (with exact implementation plan) vs. any
other option the data suggests. Don't just implement the roadmap item as
literally phrased if the numbers say that's the wrong call — this is
exactly the kind of thing worth flagging rather than blindly building.
