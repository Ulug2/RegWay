# Geopolitical Phase 1 recheck — investigate

Roadmap: `plans/regway-mvp-roadmap.md` → Priority order item 1 (sub-items
1.2 and the Phase 1 feeds). Follows `geopolitical-monitoring-implement.md`.

## Prompt

> Read CLAUDE.md, plans/regway-mvp-roadmap.md, and the two
> prompts/geopolitical-monitoring-*.md files. Keep using the audit →
> implement flow, save each pass's prompt under prompts/, and keep code clean
> and scalable.
>
> 1. Check the environment: `SUPABASE_ACCESS_TOKEN` is set, `supabase` CLI
>    can list project cfspwaqtidfliupmlfwz's functions, and
>    federalregister.gov, travel.state.gov, www.govinfo.gov and esm.sh are
>    reachable.
> 2. Recheck the previous session's work with full access:
>    - Fix roadmap Priority order item 1.2 (Federal Register full text can
>      silently be the unblock/CAPTCHA page): audit first, then make
>      `_shared/text.ts` treat a redirect to unblock.federalregister.gov as a
>      failure and fall back to GovInfo. Verify on real documents, redeploy,
>      re-run the sync backfill, and re-check the 45 country-less SDN notices
>      and any impact analyses written from a CAPTCHA page.
>    - Sanity-check the feeds against their live shape: the State Department
>      advisories RSS, and which presidential documents the topic filter
>      keeps/drops over the last 9 months.
>    - Redeploy with the CLI every function still on the old shared code
>      (match-enforcement-relevance, rematch-regulation, company-regulations,
>      sync-sec-enforcement, sync-finra-enforcement,
>      sync-sec-admin-proceedings), so production matches the repo.
> 3. Then continue with roadmap item 1's remaining Phase 2 work, starting
>    with fund → company holdings.
>
> Deploy and test against the live project; tell me before anything that
> deletes or overwrites production data beyond test rows you created.

## Environment (2026-10-04)

- `SUPABASE_ACCESS_TOKEN` set. The CLI wasn't installed; `npm i -g supabase`
  (2.119.0) works and `supabase functions list` shows all 13 functions.
- federalregister.gov API, travel.state.gov, www.govinfo.gov, esm.sh: 200.
  `unblock.federalregister.gov` itself is denied by the container proxy.
- Deno: `npm i -g deno` (the deno.land installer is blocked).
- SQL: Management API `POST /v1/projects/<ref>/database/query` with the token
  (the Supabase MCP connector needs re-auth in this session).

## 1.2 — Federal Register full text behind a CAPTCHA

**Live behaviour.** From this container, every federalregister.gov document
URL tried (`.txt` full text, HTML page, `.xml`) answers with
`302 → https://unblock.federalregister.gov/`, on both attempts. The API
(`/api/v1/documents.json`) is not blocked. `fetchPlainText` follows redirects
and judges only length, so a blocked fetch returns the unblock page's text
as if it were the document.

**GovInfo.** `https://www.govinfo.gov/content/pkg/FR-<yyyy-mm-dd>/html/<doc
number>.htm` returns the official GPO text (`<pre>`-wrapped) for every
document tried, including same-day ones and correction documents
(`C1-2026-18574`). GovInfo's `.xml` path redirects to an error page, so
`.htm` is the one to use.

**The 46 country-less SDN notices are not a CAPTCHA casualty.** Each was
re-read from GovInfo and run through the repo's own `extractCountries`:

| Body | Count |
|---|---|
| Designee list published as an image (`[GRAPHIC] [TIFF OMITTED]`) | 35 |
| Text only, no country named (generic "31 CFR chapter V" notices, one PRA notice) | 11 |
| Text names a country | **0** |

The one country signal that *is* in the text is the authority line:
`(Authority: E.O. 13902.)` (Iran), `E.O. 13553, E.O. 13876, E.O. 13902` (Iran),
`E.O. 13882` (Mali), versus program-wide ones like `E.O. 13224` (terrorism),
`E.O. 13382` (WMD), `E.O. 13581` (transnational crime), `E.O. 13694` (cyber).
This matters for cost: `match-geopolitical-relevance` treats a country-less
item as a global measure and sends it to the AI for every firm with any
foreign exposure, so 46 notices that the pre-filter could have dropped for
free are evaluated (and rejected) by Claude on every run.

**Impact analyses.** 3 Federal Register analyses exist. 2 read the real text
(`2026-14334` aircraft Section 232, `2026-05214` Section 301: both cite
specifics only the body carries). 1 was written blind: `C1-2026-18574`
(Opportunity Zone reporting, Cartesian Capital Group, 2026-09-29) says
"the regulatory text is unavailable" throughout. Regenerating it overwrites
a production row → ask first.

## State Department advisories RSS (live)

Parser holds up: 216 items, every title matches `<place> - Level n: <label>`,
every `pubDate` parses (`Wed, 09 Sep 2026`, no time). Levels 1/2/3/4:
82/82/29/23. Places that don't resolve to a country are all level 1-2
territories (Curaçao, Aruba, …), plus `Cote d Ivoire` and `Republic of
Congo` (missing aliases; both level 2 today). Three real problems:

1. **Summaries lose their opening words.** Descriptions are
   `<![CDATA[Do not travel<p>to Iraq due to …`; `rss.ts` strips tags with
   `<[^>]+>`, which eats `<![CDATA[Do not travel<p>` as one "tag". Stored
   summary: "to Iraq due to terrorism, …".
2. **Summaries are often the change note.** 104 of 216 descriptions open with
   "There were no changes to the advisory level…" / "Reissued after periodic
   review…", which becomes the whole visible summary.
3. **Duplicate developments.** The site is mid-migration: a country's link
   flips between `…/traveladvisories/iraq-travel-advisory.html` and
   `…/travel-advisories/destination.irq.html` between runs (48 new-style, 162
   old-style, a few one-offs today). The row key is the URL path, so Iraq
   level 4 exists twice (rows 3 minutes apart). 0 relevance rows reference
   advisory rows, so re-keying is cheap, but it rewrites 60 production rows
   → ask first.

## Presidential documents, last 9 months (live)

213 documents; the topic filter keeps 59, drops 154. Kept set is right
(sanctions EOs, IEEPA continuations, Section 232/301 actions, Canada duties).
Dropped set includes real trade/sanctions actions the regex misses on word
form:

- 3× "Excluding Certain Canadian Products From **Importation** …"
- "Temporary **Duty**-Free **Importation** of Phosphate Fertilizer From Morocco"
- "Continuing the Suspension of **Duty**-Free De Minimis Treatment for All Countries"
- "Continuation of … Authorities Under the **Trading** With the Enemy Act" (Cuba)
- "Strengthening **Customs** Enforcement"

Over-keeps are mild ("National Emergency With Respect to Energy" is domestic)
and the matcher's prompt rejects them.

## Deployed vs repo

`supabase functions list`: match-enforcement-relevance, rematch-regulation,
company-regulations (2026-10-01), sync-sec-enforcement,
sync-finra-enforcement (09-30), sync-sec-admin-proceedings (10-01),
regway-ai-chat (10-01) predate the shared-module changes in `ad0265a`
(`relevance.ts` dedupe, `rss.ts` entity decoding, `impact.ts` split).
Everything gets redeployed after this pass's shared changes anyway.

## Plan

1. `_shared/text.ts`: a response that ended on a known block-page host is a
   failed fetch (no retry: it's deterministic), so the next candidate runs.
2. `_shared/federalRegister.ts` (new): one place that knows a Federal
   Register document's text URLs — FR `.txt`, then GovInfo `.htm`, then the
   HTML page. Used by the sync and by `impact.ts`.
3. `_shared/sanctionsPrograms.ts` (new): country-specific sanctions
   authorities (E.O. number → country); OFAC notices add the countries of
   the programs their body cites. Program-wide authorities map to nothing on
   purpose. Matcher prompt wording updated to match.
4. `rss.ts`: unwrap CDATA before stripping tags.
5. `sync-travel-advisories`: key rows by country + level, not URL; summary
   skips the leading change note; add the two missing aliases.
6. Presidential topic pattern: word forms (`importation`, `duty`), Trading
   With the Enemy Act, customs, de minimis.
7. Redeploy all functions with the CLI; re-run the Federal Register backfill
   (since 2026-01-04) and the advisories sync; ask before regenerating the
   blind impact analysis and before re-keying advisory rows.
