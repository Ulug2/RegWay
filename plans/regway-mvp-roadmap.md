# RegWay roadmap

What is still to do. Finished work was moved out on 2026-10-12 to
[`docs/archive/roadmap-history.md`](../docs/archive/roadmap-history.md),
which keeps every completed entry with what was verified and how. Code
comments that say "roadmap 16b.2" or "item 15" refer to numbers in that
history; the open items below keep their old numbers.

## How this file is used

- **The owner** (Ulugbek) decides what is on this list and each week picks the
  tasks for the team from it.
- **The lead** (Aadit) turns those into GitHub Issues, assigns each to one
  person, reviews and merges the pull requests.
- **Contributors** work from their issue. When a pull request finishes an
  item here, the same pull request deletes it from this file and adds a
  short entry at the top of the history file (what changed, how it was
  checked, what is still not verified).
- Found something wrong that is not your task? Open an issue and add a line
  under "Known defects". Do not fix it in passing.
- "Verified" means someone watched it work. "Built" means the code and its
  tests exist. Keep that distinction when you write here.

Sizes: **S** hours, **M** a day or two, **L** several days, **XL** a
multi-phase build.

## Standing facts

- The firm and its funds are always US-based. Portfolio companies can be
  anywhere.
- Profile = the person (name, email, password). Settings = the firm (firm
  details, funds, portfolio companies).
- H.I.G. Capital is the test account, on a real firm's public facts plus
  invented entities whose names end in "(test)". Scheduled matching runs
  for H.I.G. only (`scheduled_matching_firms`).
- One AI provider (Anthropic Claude). The regulatory matcher runs on Haiku
  4.5; the geopolitical and enforcement matchers, analyses, chat and company
  scans on Sonnet 4.5. Every verdict call runs at temperature 0.
- Measured cost per call: company scan $0.20, impact analysis $0.06 on
  average (up to $0.22), matcher batch of 40 documents $0.05, chat message
  $0.06 to $0.07, re-check $0.01 or less.
- Contributors work on a local database and never hold production keys.
  Anything below marked **owner** needs production access, AI credit or a
  product decision.

## In progress

### 17. RegWay AI: Skeptic on matching, checked chat answers (XL) — owner; built, waiting to be measured and switched on
The owner is working on this; nobody else changes
`supabase/functions/regway-ai-chat/`, `_shared/ai/`, `_shared/roles/`,
`_shared/verdictReview.ts`, the matchers' judges
(`_shared/regulatoryJudge.ts`, `_shared/geopoliticalJudge.ts`),
`_shared/impact.ts` or `rematch-regulation` without asking first.

Why: relevance reasoning drifts speculative, and two prompt fixes have not
cured it. A Skeptic is a separate second pass with its own context, which
one prompt cannot do for itself. Decided with the owner on 2026-10-15: the
Skeptic goes on matching first, where the false matches are; the chat keeps
answering in one call and is checked afterwards only when an answer claims
something applies to the firm, a fund or a company, with live step labels.
The full seven-role chat pipeline in
`plans/regway-ai-multi-agent-architecture.md` is not being built: it would
cost about four to five times as much per message and slow every answer.

Built (2026-10-15, three stacked pull requests, all switched off):
1. **PR #19, one AI client** (`_shared/ai/`): every Claude call goes through
   `callClaude` / `streamClaude` (timeout, one retry, cost recording);
   `runTool` for structured answers; `models.ts`.
2. **PR #20, the Skeptic on matching**: reviews each match the regulatory
   and geopolitical matchers (and a user re-check) mark relevant: keep, move
   to the right entity, or reject. Recorded in `verdict_reviews` (migration
   0036). `SKEPTIC_MODE` = off | shadow | on. `review-existing-matches`
   reviews a firm's existing matches without changing them, then applies
   only the reviews the owner approves.
3. **PR #21, checked chat answers**: `CHAT_REVIEW` = on. A claim gate
   (Haiku) finds applicability claims; the Skeptic (facts) and a citation
   check (quoted passages) run side by side with step labels; a note under
   the answer, saved with it.

Not verified: no real AI call has been made by any of it. The prompts'
judgement is untested.

Left, in order (owner):
1. Merge #19, #20, #21; `supabase db push` (migration 0036); deploy
   `match-relevance`, `match-geopolitical-relevance`, `rematch-regulation`,
   `review-existing-matches`, `regway-ai-chat`, and the functions that use
   the client (`regulation-impact`, `match-enforcement-relevance`,
   `company-regulations`, `sync-sec-admin-proceedings`, `group-duplicates`,
   `sync-regulator-feeds`).
2. Run `review-existing-matches` on H.I.G. (about $0.30), read the reviews
   (SQL in `supabase/README.md`). Bar: the three known false matches below
   rejected or moved, and no clearly correct match rejected.
3. `SKEPTIC_MODE=shadow` for a few days of new matches, read
   `verdict_reviews`, then `on`; apply the approved backfill reviews.
4. About 15 chat questions on H.I.G. (applies / does not apply / borderline
   / explain-only / drafting) with `CHAT_REVIEW=on` locally or on a
   preview, then switch it on.
5. Later, if wanted: the same hook for the enforcement matcher and company
   web scans; a Skeptic before the impact analysis is written.

Known cases the Skeptic should fix:
- A Section 301 "manufacturing sectors" investigation matched to 3Pillar
  Global (software) through India.
- An EPA approval of Florida's air-permit forms on the firm page because
  H.I.G. is headquartered in Florida.
- Verdicts stored for the firm that are about one company (the UK
  Employment Rights Act and the EU Customs Code both say "applies to
  A.L.A. S.p.A.").

## Open for the team

Ready-to-take versions of these, with acceptance criteria, are in
`docs/starter-tasks.md`.

### 16f. Asked for by the owner
- **FAQ page** (S–M). A fifth public page at `/faq`, linked from the footer
  and the page navigation (`PAGES` in `src/lib/router.ts`, `InfoPage.tsx`).
  Needs the questions from the owner; suggested: what RegWay is, who it is
  for, where the data comes from, how matching works and how wrong it can
  be, what the AI sees, what it costs, how to get access.
- **Rename the dashboard's level buttons** (S): "PE Firm" → "General
  Partners", "Fund Structure" → "Funds", wherever they label the same thing
  (the chat's session context, the landing page) and in the tests that
  click them by name.

- **Filter portfolio companies by fund** (M). On the dashboard's Portfolio
  Companies level, choosing a fund shows only the companies that fund
  holds. The data is already there: `fund_holdings` records which fund
  holds which company (`fetchHoldings` in `src/lib/data.ts`), and a company
  can sit in more than one fund.
  - **To design first** (a sketch on the issue before code): where the
    control goes and what it looks like. Options: a row of fund chips above
    the company list ("All funds" first); a dropdown beside the level
    buttons; or grouping the list under fund headings with no control at
    all. Follow `DESIGN.md`; check phone width, where a row of chips for
    many funds must scroll or wrap.
  - **To decide**: where companies with no fund recorded appear (suggested:
    under "All funds" and under their own "No fund recorded" choice, so
    they are never hidden); whether the choice is kept in the address so a
    reload and a shared link keep it; whether opening a fund's page should
    offer "see this fund's companies" as a way in.
  - **Done when**: choosing a fund narrows the list, "All funds" restores
    it, a company in two funds shows under both, companies without a fund
    stay reachable, and browser tests cover each.
  - Files: `src/components/Dashboard.tsx` (one person at a time in this
    file), `src/lib/data.ts`, `tests/e2e/dashboard.spec.ts`.

### Known defects (S each unless marked)
- **An email to the owner when the AI stops working** (S; needs the
  owner's yes). The dashboard says so since 2026-10-17 (`ai_status()`,
  migration 0038), but only to someone who opens it; the credit ran out
  unnoticed for nine days in October.
- **Failing-source banner is vague and ungrammatical**: "Regulator feeds
  (U.S., UK and EU) hasn't updated…" when one feed of eleven is down. It
  should name the feed (`Dashboard.tsx`, `SOURCE_LABELS` in `data.ts`).
- **Source names live in three places**: `SOURCE_LABELS` (`data.ts`),
  `SOURCE_NAMES` (`duplicates.ts`), the landing page's list.
- **Old locations with a full state name are misread**:
  `parseLegacyLocation("Miami, Florida")` gives city Miami, country
  Florida. Affects rows with `hq_location` but no `profile.hq`.
- **Feed summaries show raw HTML entities**: an FCA card read "…These
  include:&nbsp;Guidance focused…". Not reproduced since; `_shared/rss.ts`.
- **Some enforcement cards repeat the title as the summary.**
- **After stopping a chat answer, the empty bubble stays** until the next
  message. (Chat file: ask the owner first, see item 17.)
- **The one-year staleness threshold is defined twice** (client
  `questionnaire.ts`, server `entityFacts.ts`).
- **"JWT issued at future"**: the database now and then refuses a newly
  started function's first query. `sync-regulator-feeds` and
  `group-duplicates` retry; the other functions fail the run.
- **A possible first-click miss** on the dashboard's "Ask RegWay AI" bar,
  seen once, not reproduced.
- **Near-identical results inside one company scan** are not grouped
  ("Amendments to 23 NYCRR Part 500" twice for one company).
- **The dashboard's three levels have no address of their own**: `/` is the
  dashboard whichever level is open (M).
- **A development opened from its address alone** does not show its "Also
  published as" links until they load.
- **Companies with no HQ location** get much weaker scan results; consider
  requiring it when a company is added (needs the owner's yes).
- **`supabase/README.md` is out of date**: it lists 6 of the 17 functions.

### Code health
- **Formatting** (S, one person, when no other branches are open):
  `oxfmt --check` fails on about 157 files, so formatting is not a required
  check. Format everything once, then add the check to CI.
- **Bundle size** (M): `pnpm build` warns of a chunk over 500 kB; the
  landing page loads the whole signed-in app.
- **Dependency advisories** (M): `pnpm audit` reported 10 (7 high, 3
  moderate) on 2026-10-11, not yet sorted into shipped and build-only.
- **Phone widths and other browsers** (S, findings only): the newer screens
  were not checked on a phone; Profile, the development page, tablet
  widths, Safari and Firefox were not looked at after the redesign. No
  accessibility review is recorded.
- **Account flows never run end to end**: email change (confirmation
  email) and password change on the Profile Account tab.

### 16h. Sources that need their own feed (M each; the owner approves each)
The Federal Register is read for 64 agencies, plus SEC, FTC and CFPB
announcements, SEC and FINRA enforcement, travel advisories, and UK and EU
regulators and sanctions. Not read, each needing its own feed: NFA, MSRB,
PCAOB, NERC, Fannie Mae / Freddie Mac / Ginnie Mae guides, NAIC, DOJ and
U.S. Attorney press releases, HHS OIG and EPA enforcement, CFTC and CFPB
enforcement pages, court decisions, Congress.gov, Regulations.gov dockets,
the Unified Agenda. Compared against the owner's source registry document
(`Regway_US_Regulatory_Source_Master_Registry_Comprehensive_V2`, kept by
the owner; ask for it if your task needs it).

Also open here:
- **CFTC feeds answer 403** to Supabase's addresses, so CFTC announcements
  and enforcement are not read (its rules arrive through the Federal
  Register). No workaround tried.
- **OFAC** has no usable recent-actions feed; it arrives through the
  Federal Register, days later than OFAC's own site.
- **Federal Reserve and OCC feeds** work but were left out (bank
  supervision). One entry each if a portfolio company is a bank.
- **Immigration and employment-eligibility rules are not read**: USCIS
  publishes only under Homeland Security, which is not on the list.
- **Notices** from the 43 agencies added on 2026-10-08 are not read, only
  rules and proposed rules.
- **UK and EU announcements are not paired with their later instruments**
  (only SEC, FTC and CFPB ones are). EUR-Lex entries have no summary, so
  the matcher judges them on the title alone.
- **State, county, city, tribal and licensing-board sources**: none read
  directly; only the per-company web search reaches them.
- **Choosing which agencies each firm's matcher reads** from its recorded
  industries: free, and would cut the noise the wider list adds.

Each new feed adds documents the matcher pays to judge. Watch H.I.G.'s
matching cost and the quality of matches from the newer agencies.

## Owner and lead

### 16g. Security verification audit (L) — not started
RegWay holds what a firm would not want seen: which companies each fund
holds, where they operate, and the questions people ask about them. To work
through before more firms use it, most serious first:

1. **Who can read what (row-level security).** Every table: can a signed-in
   user of firm A read or change firm B's rows? Includes `firms`, `funds`,
   `portfolio_companies`, `fund_holdings`, `regulation_relevance`,
   `regulation_impacts`, notes, flags, dismissals, conversations and
   messages, `profile_changes`, `usage_events`, the logo bucket. Test with
   two accounts, not by reading the policies. Run Supabase's security
   advisors. (The two-account test can be written against a local
   database by a contributor: starter task 13.)
2. **Edge functions.** Each one: does it check the caller's session, take
   the firm from the session and never from the request body, refuse an id
   that belongs to another firm? Which can be called with no session (the
   scheduled ones) and what stops a stranger calling them? CORS allows any
   origin (`_shared/cors.ts`).
3. **Secrets.** What is in the browser bundle, what is in the repository's
   history (scanned 2026-10-11: nothing found), where the AI key and the
   service key live and who can read them.
4. **Sign-in.** Rate limits on sign-in, sign-up and reset (none of our own
   today: `check_rate_limit` needs a signed-in user), session length,
   email-change and reset-link handling, two-factor sign-in.
5. **What goes to the AI provider.** Which profile facts, chat text and
   files are sent, retention terms, whether a firm can be promised its data
   is not used for training. Prompt injection through a published document
   or an attached file.
6. **The browser.** The chat renders model output as HTML through our own
   Markdown renderer: review it again now that tables, links and code
   blocks exist. Cached firm data sits in `localStorage` until sign-out. No
   Content-Security-Policy or other security headers (`vercel.json` has
   only the rewrite).
7. **Addresses.** `/developments/:id` shows any public document to any
   signed-in user, and must never show another firm's reason or analysis.
8. **Dependencies and platform.** The agent skill packs in
   `.claude/skills/` (third-party instructions run with the agent's
   permissions), who has Supabase and Vercel access and two-factor on
   those accounts, database backups and whether a restore was ever tried.
9. **Records.** No audit log of who read or changed what.
10. **An outside test**, then a decision on SOC 2: buyers at PE firms will ask.

### 18. Research the firm on the web after onboarding (M–L) — owner
Asked for by the owner on 2026-10-12. Today the AI knows only what the user
typed during onboarding. After onboarding finishes, the AI should take
those answers, search the web for more about the firm, and keep what it
finds so that matching, analyses and the chat have more to go on.

- **What to look for**: what the firm says about itself (strategy,
  sectors, regions, size), its funds, its portfolio companies and what
  each does, regulatory registrations and filings (for example Form ADV),
  offices, recent deals and news.
- **Where it is kept** (to decide): "memory" has no home yet. Suggested:
  a research record per firm (what was found, the source link for each
  fact, when), kept apart from the answers the user gave, and passed to
  the AI as background. Facts the user never confirmed must not be mixed
  into the profile as if they had: the product's promise is that a match
  traces to a fact someone stands behind (fact provenance,
  `profile_meta`).
- **Confirm step** (to decide): show the user what was found and let them
  Confirm / Edit / Not sure, so researched facts can become profile
  answers. This is the "company enrichment and a confirm screen" idea from
  the onboarding document, applied to the firm first.
- **How it runs**: in the background after onboarding, like a company scan
  (Claude with web search). Expect about the cost of a scan, $0.20 or more
  per firm; measure it. It must not delay the first dashboard.
- **Risks to design for**: the wrong firm with a similar name; stale or
  wrong pages taken as fact; a web page that carries instructions for the
  model (prompt injection, see 16g.5); researched facts producing the
  speculative matches item 17 is meant to stop.
- **Fits with item 17**: the Context Analyst role is the natural reader of
  this record. Decide whether this is built as part of 17 or before it.
- Needs a migration (the research record), a server function, and a
  change to what the matchers, analyses and chat are given.

### 6. Cost optimization, remaining levers (S–M each) — owner
1. **Stop pre-writing analyses nobody opens.** Matchers and scans write up
   to 8 in the background per new match. The on-demand path exists; the
   trade-off is a 30 to 60 second wait on first open.
2. **Company scans are the biggest recurring cost**: $0.20 per company,
   weekly and after profile edits. Options: scan every 14 to 30 days, cap
   web searches at 3, or scan once per sector and location and share.
3. **Message Batches API (50% off)** for `run-matching` and background
   analyses.
4. **Only match firms in use**: enrol on sign-in, drop firms with no
   sign-in in N days.
5. **Shorter analysis input**: analyses read up to 60K characters; long
   rules drive the $0.22 calls.

Related, undecided: tune the per-user rate limits (15, 20 and 30 an hour
are guesses) against real usage; nothing watches the AI balance or daily
spend, and the owner has said no alert is wanted for now.

### Analyses and matching — owner (these change what the AI is asked)
- **Every analysis includes the firm, matched or not** (`_shared/impact.ts`
  always lists the FIRM line): an analysis matched to GetixHealth only asks
  five questions about H.I.G.'s own health plan.
- **An analysis doubted that a portfolio company belongs to the firm**
  where fund holdings were not recorded.
- **An analysis is written from the first version** of a development and
  not rewritten when the official text arrives.
- **A later version opened where it stands alone** has no analysis ready
  (30 to 70 seconds on first open).
- **The announcement-to-rule link has no review step**: the links go live
  at once (all 8 so far were read and correct). No unlink control.
- **The server does not refuse a second analysis request** for the same
  development while the first is running (the client does).
- **`regulation_impacts.created_at` keeps its first value** when an
  analysis is regenerated. Needs an `updated_at` (a migration).
- **Matchers do not read fact provenance**; only analyses and chat are told
  what is unrecorded or over a year old. A development's page does not show
  the dates of the facts its match rests on.
- **Registry grounding in the company scan** (item 14, part 2): tested live
  twice, worse both times (8 items, then 2, then 0), not shipped. Untested
  alternatives: filter results after the search; more searches; use the
  registry to choose agencies per firm.
- **Closing the browser tab mid-answer loses the answer.**
- **A single-item re-check is a little more generous** than the batch
  matcher.

### Product decisions waiting on the owner
- **Email alerts and the Morning Brief** (item 12, Phase 3; M). Skipped for
  now. Needs an email provider and a definition of "high priority". The
  per-fund notification preference is stored; nothing sends.
- **Public pages** (About, Sources, Legal, Privacy): not yet read by the
  owner, not written by a lawyer. No contact address (`CONTACT_EMAIL` in
  `InfoPage.tsx` is unset), no company name or governing law. Privacy names
  its providers by kind, not by name.
- **Search listing**: indexing was requested on 2026-10-08; check
  `site:regwayai.com`.
- **Fact provenance**: is one year the right age to ask for
  re-confirmation; should the user who confirmed be recorded; answers
  entered before 2026-10-08 are undated until someone confirms them.
- **CFTC and OFAC through the Federal Register only**: acceptable?
- **Scheduled matching beyond H.I.G.**, and per-firm local-time schedules.
- **Chat features asked for, not built**: rename, pin and archive
  conversations; thumbs up and down and share; citations attached to
  sentences; saving an answer as a note or flag; an "Analyzed N sources"
  line.
- **Multi-user firms**: one user per firm today. Blocks "investment owner
  per company" and brief recipients.
- **Company enrichment and a confirm screen** after a company is added
  (research public facts, let the user Confirm / Edit / Not sure). Item 18
  does this for the firm first.
- **A real history of a development** (how its status changed).
- **Vercel previews**: every pull request gets a preview deployment; which
  Supabase address previews are built with was not checked.

### Live checks still owed — owner (need the H.I.G. sign-in and AI credit)
| What | How | Est. cost |
|---|---|---|
| Company scan storing a real `why_it_applies` | Change a company's HQ, sectors or regions, save, read "Why it's here" on its new items | $0.20–0.70 |
| Analysis of a not-yet-published document | When a pre-publication item is matched to H.I.G. | $0.06–0.22 |
| A re-check running to the end from the browser after a profile save | Edit, wait five minutes, watch | under $1 |
| UK / EU sanctions matching on a firm it should match | Needs a test firm with a location in a sanctioned country and in the UK or EU | small |
| "Last confirmed over a year ago" reaching the AI | Unit tests only; nothing on H.I.G. is that old | — |
| Saving a confirmation or a document label on real data | In Settings, as the H.I.G. user | free |

Deployed functions other than the ones redeployed on 2026-10-08 were
compared with the code by deploy time, not line by line.

### Team setup — owner
- Turn on branch protection for `main`; invite the contributors; add
  Aadit's GitHub handle to `.github/CODEOWNERS` (steps at the end of
  `CONTRIBUTING.md`).
- Run `scripts/export-demo-firm.sh` once against the hosted project and
  commit `supabase/seeds/demo-firm.sql` (`docs/local-demo-data.md`). Until
  then local dashboards are empty. Tested against a local database only.
- Create a development AI key with a low spend limit for contributors who
  need one (`docs/onboarding.md`, "Using the AI").

## Housekeeping (production data, owner)
- H.I.G. carries test data: 3 funds and 4 companies whose names end in
  "(test)", and 8 holdings assigned for testing, not checked against
  H.I.G.'s real holdings. Remove them in Profile when no longer wanted.
- Two duplicate "NovaPay" test rows.

## Not planned
- **SEC EDGAR full-text search**: it is where companies file in response to
  rules, not a source of new rules. A different feature; no use case yet.
- **State-level coverage by fixed feeds** (Delaware, NY, CA): no free API
  per state comparable to the Federal Register.
- **Portfolio-company non-US coverage beyond the web-search scan**: revisit
  only if real usage shows a gap for a specific country.
