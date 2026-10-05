# Investigate: enforcement monitoring, part 1 (SEC)

Roadmap item: "Product realignment" #1 — enforcement monitoring. Doc names SEC and FINRA.
Real evidence gathered (branch: feature/enforcement-monitoring):

## SEC — two working, official, no-key feeds
- Litigation Releases: `https://www.sec.gov/enforcement-litigation/litigation-releases/rss`
  (200, real items, e.g. LR-26655 dated today). The OLD path
  `/rss/litigation/litreleases.xml` is a genuine 404 — SEC restructured the site;
  any future reference to the old path is stale.
  - Each `<item>`: title = respondent name(s), `dc:creator` = release number (e.g.
    "LR-26655" — good `external_id`), `link` = an SEC.gov HTML page (NOT a PDF).
  - Fetched a real release page (lr-26655): the body contains a full plain-language
    narrative after the heading "Litigation Release No. ###" — case number, court,
    filing date, "as alleged" / "without admitting the allegations" framing, specific
    conduct, statutory provisions. This is rich enough to match and analyze,
    same shape as `_shared/impact.ts` already expects (fetch full text, strip
    HTML, pass to Claude).
- Administrative Proceedings: `https://www.sec.gov/rss/litigation/admin.xml` (200,
  real items). `link` here is a **PDF** (e.g. `.../admin/2026/34-106519.pdf`), not
  HTML — needs a different text-extraction path (native PDF to Claude) than the
  litigation-release/regulation text-fetch pattern. Scope as a separate follow-up
  (part 2b), not bundled into this pass.
- One transient 403 was observed on a rapid repeat request (looked like WAF/rate
  behavior, not a real block) — worth a retry-once on non-200 before treating a
  fetch as failed, same caution `sync-federal-register` doesn't currently need
  since the Federal Register API hasn't shown this.

## FINRA — no reliable official feed found; deferring
- `feeds.finra.org/news-and-events/feed`: DNS resolves to a stale FeedBurner ->
  Google feedproxy alias; TLS handshake fails (`SSL_ERROR_SYSCALL`). Dead.
- `www.finra.org/rss.xml`: works, but is FINRA's generic "recently updated page"
  feed (FAQs, guidance pages) — no disciplinary-action content.
- The current Disciplinary Actions Online page has no RSS/feed link in its HTML.
- `api.finra.org` is real (returns a structured "dataset not found" error, not a
  network failure) but is FINRA's market-data API (Query API); no disciplinary-
  actions dataset found under a guessed name, and enumerating its full catalog
  is its own investigation, not a quick check.
- Conclusion: build SEC-only for this pass. FINRA needs its own investigate pass
  (candidates: browsing api.finra.org's real dataset catalog if one is
  published, the FINRA-notices precedent's approach of an existing site pattern,
  or a third-party dataset like OpenSanctions with its own reliability/licensing
  check) — don't build a scraper against the HTML search page silently.

## Schema implications
- `regulations.source` check constraint needs a new value: `sec_enforcement`.
- Add `category` (`regulatory` | `enforcement` | `geopolitical`), default
  `'regulatory'` so every existing row and the Federal Register sync are
  unaffected. This is the column the "Product realignment" doc's category
  filter (roadmap item 3) will later read.
- `match-relevance`'s candidate query is hard-filtered
  `.eq('source', 'federal_register')` — enforcement items are invisible to it
  as-is. Doc requires enforcement matching to reason differently anyway
  (compare case facts to entity activity, explicit no-wrongdoing-implied
  language, state differences/missing facts, don't accept a shared industry
  label as a match) — a second prompt/schema, not a shared one. Factor the
  common plumbing (auth/firmId resolution, entity fetch, rate limit, upsert)
  into `_shared/relevance.ts` so `match-relevance` and the new
  `match-enforcement-relevance` share it instead of duplicating ~100 lines.
