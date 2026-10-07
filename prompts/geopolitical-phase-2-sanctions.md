# Geopolitical monitoring, Phase 2: UK and EU sanctions (roadmap item 13)

## Prompt

> Just constantly work on that then if u finish go to item 13.

## Audit (2026-10-07)

Item 13 had two parts: UK / EU sanctions and OFAC Recent Actions "once a
portfolio company with UK/EU-specific exposure makes them worth a
connector", and one known false positive left for the Skeptic pass (item
17). H.I.G. now holds A.L.A. S.p.A. (Naples; operates in the UK and
France), so the first part was due. The second is untouched.

| Source | Result |
|---|---|
| EU: EUR-Lex feed of Parliament and Council acts (`rssId=162`) | Carries every Council "restrictive measures" regulation and decision. Used |
| EU sanctions map (`sanctionsmap.eu`) | No feed found |
| UK: legislation.gov.uk new statutory instruments | Sanctions regulations appear here ("The Russia (Sanctions) … Regulations"). Used |
| UK: OFSI on gov.uk (organisation Atom feed) | General licences, notices, regime guidance, mixed with webinars and FAQs. Used, filtered |
| UK: OFSI consolidated list (CSV, 16 MB) | A list of names, not developments. Not used |
| OFAC `ofac.treasury.gov/rss.xml` | Program pages last touched 2021–2025, not recent actions. No recent-actions feed found. OFAC keeps arriving through the Federal Register |

## Design

1. Three more entries in the feed registry (`_shared/regulatorFeeds.ts`)
   with category `geopolitical`: `eu_sanctions`, `uk_sanctions`, `ofsi`.
   `sync-regulator-feeds` already polls the registry; two of the three
   reuse a URL another feed reads, fetched once per run.
2. Each entry is tagged with the countries it names
   (`extractCountries`), never the publisher's own. An entry naming no
   country is not stored: it would be a "global" candidate for every firm.
3. `match-geopolitical-relevance` skips UK / EU sanctions sources for a
   firm with no connection to that region (`geopoliticalSourcesOutside`),
   on top of its existing country pre-filter.
4. The judge is told a UK / EU measure needs two recorded facts on the
   same entity: a connection to the affected country and a presence in the
   UK / EU.

## Result on H.I.G. (first sync)

14 items stored: 11 EU (Russia, Ukraine, DR Congo, Burundi, Afghanistan)
and 3 OFSI (Russia, Iran). None names a country H.I.G. is connected to
(Italy, United Kingdom, France, India), so none reached the model: $0.

## Not done

- The EU publishes each action twice (a CFSP decision and the regulation
  implementing it): two rows per action. Item 15 (duplicates).
- Most entries are changes to who is listed, which the judge already
  treats as "not a connection". A sectoral measure reads the same in the
  title; only the text tells them apart, and the feed carries no summary.
- Not exercised live with a matching firm: no test firm has a recorded
  location in a sanctioned country and in the UK / EU.
