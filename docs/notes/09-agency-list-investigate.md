# Investigate: expand the `sync-federal-register` agency list

You're working in the RegWay repo (`/Users/ulykbekkhairulla/dev/regpe`). This
is a **read-only investigation pass** — do not edit code yet, but you may
make read-only `curl`/HTTP calls to the public Federal Register API (no auth
needed).

Context: `plans/regway-mvp-roadmap.md`, "Fix real US regulation coverage,"
item 3. `AGENCY_SLUGS` in
`supabase/functions/sync-federal-register/index.ts` is currently a
hardcoded 9: SEC, CFTC, IRS, DOL, EPA, FERC, HHS, FMCSA, CFPB. Candidates to
evaluate for addition: Federal Reserve, OCC, FDIC, Treasury/FinCEN
(distinct from IRS), FTC, DOJ antitrust, NLRB.

Don't guess agency slugs — the Federal Register API has a real agencies
endpoint (`https://www.federalregister.gov/api/v1/agencies`) that returns
every agency's exact `slug`. Use it rather than assuming a slug pattern.

## Steps

1. Fetch the agencies list and find the exact slug for each candidate:
   Federal Reserve (Board of Governors), OCC (Office of the Comptroller of
   the Currency), FDIC, Treasury Department (as distinct from
   `internal-revenue-service`, which is already tracked), FinCEN
   specifically (check if it has its own slug separate from
   `treasury-department`, since some Treasury bureaus are tracked
   separately in Federal Register's system and some aren't), FTC, DOJ (and
   check whether "Antitrust Division" has its own distinct slug under DOJ,
   or whether all DOJ documents are published under one parent
   `justice-department` slug with no way to isolate antitrust specifically
   via this API), NLRB.
2. For each confirmed slug, check real recent volume and usefulness: query
   `conditions[agencies][]=<slug>&conditions[type][]=RULE&conditions[type][]=PRORULE&conditions[publication_date][gte]=<9 months back>`
   and note the `count`. An agency with near-zero RULE/PRORULE volume in
   that window (e.g. an enforcement-only body that mostly issues actions,
   not codified rules) is a weak candidate — this pipeline only ever pulls
   RULE/PRORULE, never NOTICE, so an agency's enforcement actions won't
   show up regardless of whether it's added.
3. Spot-check a few actual titles from each agency's results to sanity
   -check relevance to a PE/GP context (financial services regulation,
   labor law, competition/antitrust, banking) rather than irrelevant noise.
4. Note whether Treasury Department (the parent) already appears in our
   `regulations` table under the existing IRS-only tracking — check via
   psql (same pattern as before) whether any current rows have
   `agency = 'Treasury Department'` despite `internal-revenue-service`
   being the only Treasury-related slug currently tracked (this happened
   in a recent test and is worth understanding: does Federal Register
   sometimes tag a document under the parent agency name even when queried
   via a sub-agency slug?).

## Output

A precise recommendation per candidate: confirmed real slug (or "no
distinct slug exists, would require tracking the broader parent instead"),
recent RULE/PRORULE volume, and a clear include/exclude call with reasoning
— not just "add everything the user listed" without checking whether each
one actually contributes usable data through this specific pipeline
(RULE/PRORULE only).
