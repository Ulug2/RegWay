# Live monitoring, Phase 2: regulator feeds (roadmap item 12)

## Prompt

> Then work on item 12. […] Just constantly work on that then if u finish
> go to item 13. Constantly test and check ur work.

## Audit (2026-10-06)

Left over from Phase 1: a regulatory pre-filter, the enforcement and
advisory syncs still running once a day, and Phase 2 itself (regulators'
own feeds, then UK and EU). Every candidate feed was fetched and read
before anything was built.

| Feed | Result |
|---|---|
| SEC press releases `sec.gov/news/pressreleases.rss` | Works. Rulemaking mixed with enforcement and events: filtered by title. Answers 429 to roughly 1 request in 10 from the edge functions |
| SEC proposed rules `sec.gov/rss/rules/proposed.xml` | Stale (newest entry July 2023). Final rules feed: 404 |
| CFTC general and enforcement `cftc.gov/RSS/RSSGP`, `RSSENF` | Work from a desktop; **403 from the edge functions**, every time. Not used |
| FTC press releases `ftc.gov/feeds/press-release.xml` | Works |
| CFPB newsroom | Works; little rulemaking |
| Federal Reserve `press_bcreg.xml`, OCC bulletins | Work. Not added: bank supervision, outside a PE firm's own obligations. One line each to add later |
| FCA news `fca.org.uk/news/rss.xml` | Press, speeches, warnings: no rule content. **FCA publications** `fca.org.uk/publications/rss.xml` has the CP / PS / GC / FG papers: used |
| PRA publications (Bank of England) | Works |
| legislation.gov.uk new statutory instruments (Atom) | Works; mostly flight restrictions and local orders, filtered by subject |
| ESMA `esma.europa.eu/rss.xml` | Works; no date field, the date is inside the description |
| EUR-Lex `display-feed.rss?rssId=162` (Parliament and Council acts), `rssId=222` (Official Journal L) | Work; ~100 entries a day, mostly Council decisions, corrigenda and farm-market measures. Empty for part of each day |
| EBA `rss.xml` | E-mail digests only. Not used |
| OFSI (gov.uk Atom), EU and UK sanctions instruments | Work; these are geopolitical measures: left for item 13 |

## Design

1. `_shared/regulatorFeeds.ts`: one registry. Each feed has a source name,
   URL, agency, region (US / UK / EU) and a `keep` rule, since a feed is a
   news stream, not a rule list.
2. `_shared/rss.ts`: `parseFeedEntries` reads RSS and Atom, and
   `writtenDate` takes the day as the publisher wrote it.
3. `sync-regulator-feeds`: polls every feed (no AI), stores recent kept
   entries, one `sync_runs` row per run (`regulator_feeds`). A feed must
   fail three runs in a row before the run counts as failed.
4. Pre-filter: `match-relevance` reads the Federal Register and U.S. feeds
   for every firm, UK and EU feeds only for a firm connected there
   (`regionsOf`: locations of the firm, funds and companies, and the firm's
   investment geographies).
5. The judge's prompt says where a non-U.S. item applies and that it binds
   only an entity recorded as connected to that place.
6. Migration 0031: new sources, the feeds every 30 minutes at :05 / :35
   (matching runs at :10 / :40), SEC and FINRA enforcement hourly, SEC
   administrative proceedings every 3 hours, travel advisories every 6.

## Found while testing live

- CFTC 403 from the edge functions: both feeds removed after the first run.
- The run was marked failed for a day because of them, which showed in the
  dashboard's failing-source banner. Hence the three-in-a-row rule.
- "JWT issued at future": the database refused a just-started function's
  first query about 1 run in 10. The read is retried once.
- EUR-Lex returns a valid, empty feed for part of the day: not a failure.
- A quote inside a single-quoted string broke the landing page build for a
  few minutes; the type check caught it before commit.

## Result on H.I.G. (first day)

24 feed items judged ($0.02, Haiku): 2 relevant, both SEC proposals
announced ahead of their Federal Register publication (crypto custody for
advisers and funds; retail access to private markets). All 16 UK and EU
items rejected with a specific reason each.
