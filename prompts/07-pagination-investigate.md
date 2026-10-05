# Investigate: pagination for `sync-federal-register`

You're working in the RegWay repo (`/Users/ulykbekkhairulla/dev/regpe`). This
is a **read-only investigation pass** — do not edit code yet, but you may
make read-only `curl` calls to the public Federal Register API to confirm
its real behavior (no auth needed).

Context: `plans/regway-mvp-roadmap.md`, "Fix real US regulation coverage,"
item 1. `supabase/functions/sync-federal-register/index.ts` currently does
a single fetch with `per_page=100` and no pagination loop — if a lookback
window across the 9 tracked agencies returns more than 100 RULE/PRORULE
documents, the rest are silently dropped with no error or log.

## Steps

1. Read the current function in full and confirm exactly how the request is
   built (`params` construction, single `fetch` call, no loop) — this is
   the code to change.
2. Confirm the Federal Register API's real pagination response shape with a
   live `curl` call (a broad query across a wide date range that's likely
   to exceed one page, e.g. SEC RULE/PRORULE since 2026-01-01). Confirm the
   response includes `count` and `total_pages`, and that incrementing a
   plain `&page=N` query param returns distinct, non-overlapping results
   (not just cursor-based pagination that requires following
   `next_page_url` verbatim) — verify this with at least two consecutive
   pages and compare `document_number`s to confirm no overlap/duplication.
3. Check whether the API enforces any hard cap on total accessible results
   regardless of pagination (some public APIs cap at e.g. 1,000 or 10,000
   records even across pages) — look for this in the response or by paging
   deep into a large result set, and note it if found.
4. Look at real recent sync volume to gauge how urgent this actually is:
   query the `regulations` table (psql, same pattern as before) for how
   many `federal_register` rows came from each of the last few sync runs,
   to establish whether 100/page has actually been hit in practice yet, or
   if this is a "won't silently break today but is a real risk at scale /
   on a first historical backfill" fix.
5. Decide a sane upper bound for the pagination loop (e.g. stop after N
   pages or M total records) so a pathological query (e.g. an operator
   accidentally passing a `since` date years in the past) can't loop
   indefinitely or hammer the API — propose a specific number grounded in
   realistic volume from step 4, not an arbitrary guess.

## Output

Exact plan: the loop structure to add (page increment condition, stop
condition, safety cap), confirmation that plain `page=N` pagination works
as expected with real curl evidence, and whether any hard API cap exists
that the cap in step 5 needs to respect.
