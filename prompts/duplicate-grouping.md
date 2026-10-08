# Duplicate-coverage grouping (roadmap item 15), 2026-10-07

Owner's choice for the look: one card, with "also published as" links. The
first version stays as the card; later versions attach to it.

## Audit: where duplicates actually were (production, 2026-10-07)

| Kind | Example | How it can be recognised |
|---|---|---|
| EU sanctions: a Decision and a Regulation for one action | 5 pairs among 11 `eu_sanctions` rows | Same act date and same regime in the title ("of 28 September 2026 … concerning restrictive measures in view of the situation in Russia") |
| One publication listed twice by a feed | FCA "GC26/6" and "FG26/8: Primary Market Bulletin No. 66" | Same source, same title without the reference number, within 7 days |
| A company scan's result that is a Federal Register document | 14 of 160 `ai_search` rows | Document number in the link, or an identical title held by exactly one document |
| An agency announcement and its Federal Register document | SEC crypto custody: announced 1 Oct, published 6 Oct | Nothing to compare: the titles differ. One announcement can cover several documents (the "retailization" release: two proposed rules) |

Not treated as duplicates: Federal Register documents with the same title
(OFAC's "Notice of OFAC Sanctions Action" is a different action each time);
a proposal and its later final rule; near-identical results inside one
company's scan (a scan-prompt matter, not grouping).

## Design

- `regulations.duplicate_of` points a later version at the first one, one
  level deep. Nothing is merged or deleted: a wrong link is undone by
  clearing the column. `duplicates_checked_at` marks a row as looked at.
- `group-duplicates` (cron :08 / :38, between the syncs and run-matching;
  service key) applies the rules in `_shared/duplicates.ts`. Three need no
  AI. The fourth asks Haiku, once per new SEC / FTC / CFPB document that
  has an announcement from the previous 60 days to compare with: "which of
  these press releases announced this document, if any". The announcement
  is always the card. A new announcement re-opens the documents around it.
  `{ "dryRun": true }` reports the links and writes nothing.
- Which version is the card: the earlier one; for an EU pair the
  Regulation (it binds businesses directly); for a scan result the Federal
  Register document.
- Every version is still judged per firm (cheap), so an entity matched only
  by the fuller document is not lost. What is saved is the analysis: one is
  not prepared ahead for a later version whose first version the firm is
  already matched to (`withoutCoveredDuplicates` in `generateImpacts`).
- Lists (`src/lib/duplicates.ts`, applied in `fetchRelevantRegulations`):
  a later version is hidden when its first version is in the same list,
  and listed on that card as a link. Where the first version isn't matched
  to that entity, the later one is the card and links back. Two documents
  from one announcement are two rules, so without the announcement they
  are two cards. A scan's page is never offered as a link.
- Dismiss and restore apply to the development: every version. A version
  that arrives after a dismissal stays hidden.
- The development's page lists the other versions in the sidebar. RegWay
  AI's list of matched developments names a development once.

## Live result

First run: 222 rows checked, 20 linked (5 EU pairs, the FCA bulletin, 14
scan results), all read and correct. On H.I.G.: three scan results on the
GetixHealth and A.L.A. pages now link to their Federal Register documents.

**The announcement rule** ran on 2026-10-08 once the AI provider accepted
calls again (it had refused every call for about an hour: "credit balance
is too low"). 11 SEC and FTC documents had an announcement to compare with.

- First attempt, with the feed's summary of each press release: 7 linked,
  all correct, 1 missed. The SEC's "retailization" release announced two
  proposals; the summary (cut at 600 characters) mentions neither by name,
  and the performance-based compensation proposal was left unlinked.
- The press release's own page is now read (first 3,000 characters of the
  body, once per run) and given to the model instead of the summary: 8
  linked, all correct, none missed. The 3 left alone (Commission quorum
  rule, EDGAR Filer Manual, a petition for rulemaking) have no press
  release.
- Links: SEC crypto custody (1 document), SEC proxy and shareholder
  proposals (2), SEC retailization (2), FTC Rules of Practice (2), FTC
  impersonation rule (1).
- Cost: about $0.003 a call; $0.11 for the three passes (two dry runs).
- On H.I.G.'s firm page two developments went from two cards to one: the
  crypto custody proposal and the retailization package.

To read the links again later:

    select s.title, p.title from regulations s join regulations p on p.id = s.duplicate_of where p.source like '%_news';

## Left open

- The card's analysis is written from the first version. When the official
  document arrives, the announcement's analysis is not rewritten from the
  fuller text; the document is one click away.
- UK and EU announcements against their later instruments (FCA policy
  statement and the handbook instrument, ESMA and EUR-Lex) are not paired.
- Near-identical results inside one company scan.
