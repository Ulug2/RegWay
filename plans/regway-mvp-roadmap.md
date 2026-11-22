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

### 17a. After item 17: the Skeptic's reach (S–M each) — owner, later
Item 17 is done (`docs/archive/roadmap-history.md`); the "Hidden" list is
done too. The rest waits until it is needed (owner, 2026-10-23). Ask the
owner before changing `supabase/functions/regway-ai-chat/`, `_shared/ai/`,
`_shared/roles/`, `_shared/verdictReview.ts`, the matchers' judges or
`_shared/impact.ts`: they decide what the AI is asked.
1. **The Skeptic for enforcement matches** (M): needs its own checklist (a
   case against someone else; overlap of conduct, never implied
   wrongdoing).
2. **The Skeptic for company web-scan results** (M): review before they
   are saved; today the backfill skips them (`source = 'ai_search'`).
- Known borderline rejection, never applied: the EU Customs Code for
  A.L.A. S.p.A. (a backfill review, so it is not in the Hidden list).

## Open for the team

Ready-to-take versions of these, with acceptance criteria, are in
`docs/starter-tasks.md`.

### 16f. Asked for by the owner
- **FAQ page** (S–M). A fifth public page at `/faq`, linked from the footer
  and the page navigation (`PAGES` in `src/lib/router.ts`, `InfoPage.tsx`).
  The questions and draft answers are in `docs/faq.md`; the ones marked
  "Owner to answer" need the owner before the page goes live.
- **Team bios and photos on About** (S): the About page lists the founders
  and the UC Berkeley Codify team with template bios and placeholder
  pictures (`FOUNDERS`, `CODIFY`, `CODIFY_MEMBERS` in `InfoPage.tsx`;
  photos go in `public/team/`). Needs the real bios, photos and the Codify
  members' names.

- **Filter portfolio companies by fund** (M). On the dashboard's Portfolio
  Companies level, choosing a fund shows only the companies that fund
  holds. The data is already there: `fund_holdings` records which fund
  holds which company (`fetchHoldings` in `src/lib/data.ts`), and a company
  can sit in more than one fund.
  - **Decided by the owner 2026-11-22** (issue #11): a row of fund chips
    above the company list, "All funds" first, scrolling sideways on a
    phone; companies with no fund recorded appear under "All funds" and
    under their own "No fund recorded" chip (shown only when there are
    any); the chosen fund is kept in the address (`?fund=`), so a reload
    and a shared link keep it. The owner's answer replaces the sketch on
    the issue. Still open: whether a fund's page offers "see this fund's
    companies".
  - **Done when**: choosing a fund narrows the list, "All funds" restores
    it, a company in two funds shows under both, companies without a fund
    stay reachable, and browser tests cover each.
  - Files: `src/components/Dashboard.tsx` (one person at a time in this
    file), `src/lib/data.ts`, `tests/e2e/dashboard.spec.ts`.

### 16i. Chat features (planned, owner 2026-10-23; S–M each)
Asked for, not built. The conversation-list ones touch only the chat's
screen and tables; the ones marked * change what the chat function returns,
so ask the owner first (item 17a).
- Rename, pin and archive conversations (needs columns on the
  conversations table: a migration).
- Thumbs up and down on an answer, and a way to share one.
- Save an answer as a note or a flag on a development.
- An "Analyzed N sources" line under an answer.*
- Citations attached to the sentences they support.*

### Known defects (S each unless marked)
- **After stopping a chat answer, the empty bubble stays** until the next
  message. (Chat file: ask the owner first, see item 17a.)
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

### Code health
- **Formatting** (S, one person, when no other branches are open):
  `oxfmt --check` fails on about 157 files, so formatting is not a required
  check. Format everything once, then add the check to CI.
- **Phone widths and other browsers** (S, findings only): the browser tests
  now run on Firefox, WebKit (Safari) and an iPhone with `ALL_BROWSERS=1`
  (issue #17, part 1). CI runs desktop Chrome on every pull request and
  WebKit plus the phone every night (owner, 2026-11-22;
  `.github/workflows/nightly-browsers.yml`). Still to do: look at every
  screen at phone and tablet width in both themes (`capture.spec.ts` takes
  them; 4 of 142 were looked at) and fix what is off. No accessibility
  review is recorded.

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

Research issues: #41 (NAIC, DOJ, HHS OIG, EPA and CFPB enforcement;
started 2026-11-22), #42 (Congress.gov, Regulations.gov, the Unified
Agenda; waits on an api.data.gov key held by the owner, never in the
repository), #15 (MSRB, PCAOB, CFTC and OFAC; the owner's).

Also open here:
- **Review CFTC and OFAC coverage** (S to look, M to build; owner,
  2026-10-23). Both arrive only through the Federal Register today, days
  after the agency's own announcement. To find: a way to read CFTC's
  announcements and enforcement that is not refused (a different address,
  their email lists, or fetching from somewhere other than Supabase), and
  an OFAC source for new designations (the Sanctions List Service's
  downloads, or OFAC's recent-actions page). Sanctions are the more
  urgent of the two. Starts from issue #15 (feed research: MSRB, PCAOB
  and CFTC).
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

### 19. Features adopted from Sidekick (owner 2026-11-22: build them all)
The plan, with what each changes and why, is in
`docs/regway-system-guide.md` §17. Each ships as its own pull request with
unit tests; none may be tested against the real AI by a contributor (the
owner runs anything that costs money). These change what the AI is asked,
so they are the owner's (item 17a's rule), approved as a set on
2026-11-22. Deploying the changed functions is a separate step the owner
asks for.
1. **Scored test set for matching** (M, §17.1). Code: the scoring command
   (`pnpm eval:matching`, prints the cost and asks before calling the AI)
   and prompt snapshots (a unit test that fails when a judge, Skeptic or
   chat prompt changes by accident). Owner: hand-marking the right verdict
   for about 150 documents, and running it. **Prompt snapshots built
   2026-11-22** (`tests/unit/prompts/`, 16 prompts; the SEC proceedings
   extraction is not covered yet). The scoring command is still to do.
2. **Fence outside text in every prompt** (S–M, §17.2).
3. **The rest of the spend caps** (S, §17.3): built 2026-11-22 (migration
   0051, history). Waits on the owner: apply 0051 in production, then
   deploy every function (they all check the caps through
   `_shared/ai/client.ts`); a later migration then drops `ai_spend_check`.
4. **Citation check in code first** (S–M, §17.4).
5. **The Skeptic must show evidence to reject** (S, §17.5). Merge only
   after the test set (1) shows recall up and precision not down.
6. **Learn facts from what users type** (M, §17.6).
7. **Chat queries the firm's data** (M, §17.7). Touches
   `regway-ai-chat`, where issues #38 and #39 also work: check with them.
8. **Read SEC PDFs with code first** (S, §17.8). Adds pdf.js, a new
   dependency (owner's review).
9. **Run traces for every AI decision** (M, §17.9): storage built
   2026-11-22 (migration 0052, history). Left: the owner-only page, export
   to the test set. Waits on the owner: apply 0052, then deploy.

## Owner and lead

### 16g. Security verification audit (L) — in progress
RegWay holds what a firm would not want seen: which companies each fund
holds, where they operate, and the questions people ask about them. To work
through before more firms use it, most serious first:

**First pass done 2026-11-21** (migration 0047, security headers; details in
the history): items 1, 2, 3, 6 and 7 below were reviewed. Fixed: any
signed-in user who knew a firm's id could add themselves to it (no sign it
was ever used); members could change columns the server trusts; rows could
point at another firm's fund or company; signed-out callers had table
rights; the logo bucket took any file; no security headers. Still open:
the two-account tests in CI (issue #12), item 4 (sign-in settings to check
in the dashboard: sign-up open or invite-only, email confirmation, leaked-
password check, password length), item 5, item 8 onwards, switching the
Content-Security-Policy from report-only to enforced after a week without
reports in the browser console.

**CAPTCHA live 2026-11-22** (Cloudflare Turnstile on sign-up, sign-in and
password reset): built 2026-11-21, switched on in the Supabase dashboard by
the owner, who then signed up on regwayai.com with it.

**Function access tests done 2026-11-21** (item 2, issue #13):
`tests/unit/functionAccess.test.ts` calls all 21 functions as an attacker
would. Nothing found.

**Spend caps done 2026-11-21** (migration 0048): AI calls are refused once
the last 24 hours reach $15 for one firm or $40 for RegWay (secrets
`AI_FIRM_DAILY_CAP_USD`, `AI_TOTAL_DAILY_CAP_USD`). The `/cso` run that day
(static, partial: no scanners, skill files excluded) found nothing else.
Monthly caps and a reserve for click-started work: Sidekick item 3 below.

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

### 6. Cost optimization, remaining levers (S–M each) — owner
Deferred (owner, 2026-10-23): spending is low since polling was stopped;
revisit if spending grows or when sponsorship changes the budget.
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
- **The Morning Brief** (item 12, Phase 3; M). Decided by the owner
  2026-11-14: every morning at 7 am in each person's own time zone, an
  email listing the headline of every match since the last brief, sending
  people to the dashboard. Needs each person's time zone (not stored
  today: save the browser's on sign-in) and an on/off beside "Email
  alerts" in Profile → Account. Reuse `_shared/email.ts` and the layout in
  `_shared/matchAlerts.ts`. The match alert emails are built (history,
  2026-11-14).
- **Public pages** (About, Sources, Legal, Privacy): not yet read by the
  owner, not written by a lawyer. Contact address: team@regwayai.com
  (2026-11-14). No company name or governing law. Privacy names
  its providers by kind, not by name.
- **Search listing**: indexing was requested on 2026-10-08; check
  `site:regwayai.com`.
- **Fact provenance**: one year stays the age to ask for re-confirmation
  (owner, 2026-10-23). Open: should the user who confirmed be recorded;
  answers entered before 2026-10-08 are undated until someone confirms
  them.
- **Scheduled matching beyond H.I.G.**, and per-firm local-time schedules:
  after launch, once there are customers (owner, 2026-10-23).
- **Multi-user firms**: one user per firm today. Blocks "investment owner
  per company" and brief recipients. Delayed (owner, 2026-10-23).
- **Research a company when it is added later** (after onboarding). Item
  18 researches the firm and the companies entered at the time; a company
  added afterwards is covered only by "Research Again". Not needed before
  the first customers (owner, 2026-10-23).
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

All 21 functions were deployed from `main` on 2026-11-22 (commit
4d9e3af, the supabase-js upgrade), so production matched the repository
that day.

### Team setup — owner
- `main` is protected by a ruleset (pull request with one approval and
  code-owner review, both CI checks, no force pushes, no deletion).
- A development AI key with a low spend limit is created when a
  contributor's issue needs one (ask through Aadit; `docs/onboarding.md`,
  "Using the AI").

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
