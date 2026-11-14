# RegWay roadmap: history

> Archived on 2026-10-12. This is the roadmap as it stood that day, kept for
> its Completed entries (what was built, how it was verified, what the owner
> decided and when). **What is still open is in
> [`plans/regway-mvp-roadmap.md`](../../plans/regway-mvp-roadmap.md); the
> "open" lists below are no longer maintained.** Paths written `prompts/…`
> are now `docs/notes/…`; `docs/Regway_…` files are in `docs/product/`.
>
> New entries go directly below this box, newest first.

### Item 12, Phase 3: match alert emails (2026-11-14)
Decided by the owner 2026-11-14: every match counts ("high priority" =
anything matched to the firm, a fund or a company); on for everyone, off in
Profile; the email lists headlines and sends people to the dashboard.
- `send-match-alerts` (every 30 minutes at :25/:55, after run-matching;
  migration 0043): one email per person per run, only when something new
  matched. One line per development with what it applies to ("Applies to
  Harbor Capital, Fund II"), its agency and date, a link to its page, and
  "Open your dashboard". Over 25 headlines: the newest 25 and "…and N
  more". No AI call.
- Left out: Skeptic rejections and other `NOT_RELEVANT` rows, dismissed
  matches, later versions of a development, a firm's first 24 hours of
  matching (seen on the dashboard while setting up), matches before the
  person's `alerts_since`, and anything already emailed
  (`match_alert_items`). Someone seen for the first time gets an
  `email_preferences` row and no email for the past.
- Profile → Account → **Email alerts**: On / Off (`EmailAlerts.tsx`).
  Turning on starts from now. The onboarding question's "coming soon"
  help text now points there.
- `alert_recipients(firm)`: the firm's people with their sign-in email,
  service role only. `match_alerts` runs are recorded in `sync_runs` but
  never shown in the dashboard's failing-source notice.
- Checked: 11 unit tests (grouping, what is left out, first-time people,
  failed sends, dry run, HTML escaping), 2 browser tests for the setting,
  the migration on the local database (own row only, recipients refused to
  signed-in users), `pnpm test:all`.
- Not checked: a real alert email (needs the hosted database, the deployed
  function and a new match; the AI was out of credit on 2026-11-14).

### 17a.3: an email to the owner when the AI stops working (2026-11-14)
- `ai-outage-email` (every 15 minutes, migration 0042) reads `ai_status()`,
  the same check as the dashboard banner, and emails team@regwayai.com once
  per outage: why it fails and what to do (top up, check the key, wait).
  An outage is keyed by when it began; `ai_outage_emails` records each one
  emailed (service role only). A failed send is not recorded, so the next
  run tries again. No AI call.
- `_shared/email.ts`: the one way RegWay sends email, through Resend
  (regwayai.com verified there 2026-11-14), from alerts@regwayai.com. The
  email alerts will use it.
- Settings: `RESEND_API_KEY` (secret), `ALERT_EMAIL_TO` (default
  team@regwayai.com), `EMAIL_FROM` (optional).
- Checked: 8 unit tests (one email per outage, nothing while the AI works,
  nothing recorded on a failed send, service key only); migration applied
  to the local database, `ai_status()` callable with the service key and
  the table hidden from signed-in users; `pnpm test:all`.
- Live 2026-11-14: `RESEND_API_KEY` set, function deployed, 0042 applied
  to the hosted database. A test email (`{ "test": true }`) was accepted by
  Resend. The first scheduled run (20:18 UTC) found a real outage, out of
  credit since 2026-11-07 (no AI call has worked since 2026-11-04), and
  emailed team@regwayai.com once.
### Contact address on the public pages (2026-11-14)
- `CONTACT_EMAIL` in `InfoPage.tsx` is team@regwayai.com, so Legal and
  Privacy end with a Contact section; the FAQ answer says the same.
- Roadmap: the email alerts entry records the address and the owner's
  definition of "high priority" (anything matched to the firm, a fund or a
  company); a sending service is still needed.
- Checked: a browser test for the Contact link on Legal and Privacy;
  `pnpm test:all`.

### Load signed-in screens on demand (2026-11-07)
- `App.tsx` lazy-loads the dashboard, chat, profile, onboarding modal,
  development page and entity page. Landing and information pages remain
  eager. Type-only imports keep `ProfileTab` and `EntityRef` out of the
  runtime bundle.
- Added themed skeleton fallbacks for page transitions and chat loading.
- Checked: `pnpm build` before and after, and `pnpm test:all` (499 unit
  tests, 171 browser tests; 14 capture tests skipped by default). The
  delayed-chunk browser checks see the skeleton backgrounds in both themes.
- Build: the single 697.92 kB entry (193.06 kB gzip) is now a 272.86 kB
  entry plus a 248.34 kB shared chunk. Including statically preloaded
  chunks, the initial JavaScript is 525.29 kB (152.36 kB gzip), and no
  chunk exceeds 500 kB.
- Not checked: Safari or Firefox.

### 17a.1: the "Hidden" list (2026-10-23)
- Profile → Hidden (`/profile/hidden`, `HiddenByReview.tsx`): each match
  the Skeptic took off the dashboard (`NOT_RELEVANT: Reviewed: …`), with
  the fund or company it was for and the Skeptic's reason, linked to the
  development. Restore puts it back with the matcher's own reason.
- Migration 0040: `restore_reviewed_match(relevance_id)`, security definer,
  only for a row of the caller's firm that was hidden by review; finds the
  rejection in `verdict_reviews` (by row for a backfill, by entity for one
  made at matching time), restores its `original.reason` and stamps the
  review's new `restored_at`, so undone rejections can be counted against
  the Skeptic. No AI call.
- Checked: the function against the local database (right review chosen
  among three, another firm's row refused, a second restore refused);
  browser tests for the list, restore and a failed restore; screenshots at
  1280px light and 390px dark.
- Migration 0041: on H.I.G., one of 21 hidden matches had no review the
  first version could find (the matcher named "Rheintal Batterie GmbH",
  the company is recorded with "(test)", so the row went on the firm). The
  level now ranks candidates instead of ruling them out; all 21 then have
  a review.
- Hosted database: 0040 applied 2026-10-23; 0041 not yet (the owner
  applies it). A restored company match reaches its fund's list at the next matching run
  (the holdings roll-up runs there). A restored match has no analysis
  until it is opened.

### 16f, in part: level buttons renamed, team on About, Legal and Privacy as documents (2026-10-23)
- The dashboard's levels read "General Partners", "Funds", "Portfolio
  Companies" (was "PE Firm", "Fund Structure"), also on the landing page;
  the browser tests click the new names.
- About: the steps numbered, and a team section: the two co-founders and
  the UC Berkeley Codify team, with template bios and placeholder pictures
  until the real ones arrive.
- Legal and Privacy: same text, laid out as documents (summary, numbered
  sections with anchors, a list of sections beside the text on a wide
  screen, above it on a phone).
- FAQ questions and draft answers written to `docs/faq.md`.
- Checked: `pnpm test:all`; screenshots of About and Privacy in both themes
  at 1280px and 390px. Not checked: Safari, Firefox.

### Item 18: research the firm on the web after onboarding (2026-10-18 and 19, PRs #30, #31)
Decided with the owner on 2026-10-18: findings the firm has not confirmed go
to the chat only, labelled; the first version covers the firm and the funds
and companies it entered, and offers ones it has not entered; review is a
dashboard card opening Profile.
- **`research-firm`** (migration 0039: `firm_research_runs`,
  `firm_findings`): after onboarding, or Profile → Found on the Web →
  Research Again (3 a day). Sonnet with web search (up to 8 searches), then
  a forced-tool extraction into questionnaire fields
  (`_shared/research/fields.ts` reads the questions from
  `src/lib/questionnaire.ts`). Kept only if it cites a page the search
  read, names a listed entity and a researchable question, and fits that
  question's options; already-recorded values dropped, differing ones shown
  as a conflict, rewordings of the firm's own descriptions dropped. Not
  sure it is the right firm → nothing stored, the reason shown.
- **Review**: a dashboard card; Profile → Found on the Web with each
  finding's source and quote, Confirm / Use This / Not Right, Add for funds
  and companies not entered. Confirming saves through the usual profile
  path with `profile_meta` source `web` and the link ("From the web:
  adviserinfo.sec.gov · confirmed …"), so re-matching follows.
- **Chat**: pending findings in the system prompt as "FOUND ON THE WEB, NOT
  CONFIRMED BY THE FIRM"; matching, analyses and the Skeptic read the
  confirmed profile only.
- **Live on H.I.G.** (2026-10-19): 13 findings in about 2 minutes for
  $0.61 ($0.52 search with 8 searches, $0.09 extraction). Useful: the legal
  name and Delaware domicile from Form ADV, 18 offices, Latin America
  added to geographies, Fund VII's U.S. focus. Noise, fixed in #31: two
  rewordings of company descriptions, and PitchBook's "Closed"
  (fundraising) proposed as the fund status. Confirmed the legal name in
  the browser (saved with its Form ADV link); "Not Right" set a finding
  aside; the chat answered an offices question saying the facts came from
  a public page and were not confirmed.
- Tests: 493 unit (16 new), 6 new browser tests; screens checked in both
  themes and at phone width.

### Item 17: the Skeptic on matching, checked chat answers (2026-10-15 to 10-18, PRs #19–#29)
Decided 2026-10-15: a Skeptic, a separate second AI pass, on matching first;
the chat answers in one call and is checked afterwards only when it claims
something applies to the firm, a fund or a company. The seven-role chat
pipeline in `plans/regway-ai-multi-agent-architecture.md` was not built (four
to five times the cost per message).
- **One AI client** (#19, `_shared/ai/`): every Claude call goes through
  `callClaude` / `streamClaude` (timeout, one retry, cost recorded);
  `runTool` for structured answers; `models.ts`. Failed calls are recorded
  with their cause, and `ai_status()` (migration 0038) puts a banner on the
  dashboard when the AI keeps failing (#25).
- **The Skeptic on matching** (#20, #23, #26, #27; `roles/skeptic.ts`,
  `verdictReview.ts`): reviews each relevant verdict of the regulatory and
  geopolitical matchers and of a user's re-check: keep, move to the right
  entity, or reject. A plausible match resting on an unrecorded fact is kept
  with "Depends on facts not recorded: …"; proposed rules are kept; the
  record states which entities are in the EU or the UK. Every review is in
  `verdict_reviews` (migration 0036). `review-existing-matches` reviews a
  firm's existing matches, applies approved ones by id, and takes `since`
  for a new round. **`SKEPTIC_MODE=on` since 2026-10-18.**
- **Checked chat answers** (#21, #24, #29; `regway-ai-chat/review.ts`): a
  claim gate (Haiku), then the Skeptic against the record and a check of
  the cited passages, with step labels and a note saved with the answer.
  Stop reaches the server through a stamp on the conversation (migration
  0037), since a closed connection does not. Notes calibrated to flag only
  what matters (#29). **`CHAT_REVIEW=on`.**
- **Measured on H.I.G.** Matches, four backfill rounds: the three known
  false matches (Section 301 on 3Pillar, the Florida air permit on the firm,
  A.L.A. verdicts stored on the firm) rejected or moved; 24 reviews applied
  (3 moves, 19 rejections, 2 kept with a note). The matcher alone had put
  about 14 wrong matches among 29. Last round: 10 of 11 right; the EU
  Customs Code for A.L.A. was rejected ("imports and exports not recorded"),
  a borderline call left unapplied (item 17a). Chat, 8 questions twice: the
  final notes caught two real errors (a rule on the adviser said to bind
  the funds) and speculative export-control claims; two remain strict but
  defensible. A checked answer costs about $0.02 more.
- Found and fixed on the way: the AI credit had run out unnoticed for nine
  days (#25); the backfill hid failed AI calls as "reviewed 0" (#22).
- Tests: 477 unit, the browser tests for the chat and the dashboard banner.

### Repository tidy-up for the team (2026-10-12)
- Roadmap cut down to open work; this file created from the old one.
- `prompts/` → `docs/notes/`, product documents → `docs/product/`, logo
  sources (`assets/`) → `docs/brand/`. References updated.
- Git LFS removed: it held two small documents, and its rules covered file
  types the repository does not contain. They are ordinary files now, so a
  clone needs no extra tool.
- Nine agent skill packs removed from `.claude/skills/` (image generation,
  brand kits, alternative visual styles that contradict `DESIGN.md`, a
  duplicate older version). Kept: design-taste-frontend,
  high-end-visual-design, redesign-existing-projects, full-output-enforcement,
  web-design-guidelines, playwright-cli and the two Supabase skills. To
  restore: `npx skills add Leonxlnx/taste-skill`.
- `AGENTS.md` rewritten: it described a Figma Make scaffold.
- `docs/onboarding.md` rewritten as the team's starting document. Verified
  for it: a key in `supabase/functions/.env` reaches the chat function
  under `supabase functions serve` (a fake key got Anthropic's 401).

---

## The roadmap as of 2026-10-12

## Start here (for the team, added 2026-10-11)

This file is the project's memory: what was built, what is open, and what
the owner decided and when. It is long because nothing is deleted from it.
You do not need to read it top to bottom.

**How it is laid out**
- **Context**: dated notes, oldest first. History; skim it.
- **Priority order**: numbered items. A heading that ends in "done" is
  finished and kept only as a pointer. The open ones are in the table below.
- **Completed**: one entry per finished piece of work, with what was
  verified and how. Read the entry for an area before changing that area.
- `prompts/` holds the investigation and implementation notes each entry
  refers to.

**How to use it day to day**
- Work is tracked in **GitHub Issues**, not here. An issue that comes from
  this file says which item ("roadmap 16f").
- When your pull request finishes an item or part of one, update this file
  in the same pull request: mark the item, and add a short Completed entry
  (what changed, how it was checked, what is still not verified).
- Found something wrong or unfinished that is not your task? Add a line
  under 16a and open an issue. Do not fix it in passing.
- Wording: "verified" means someone watched it work; "built" means the code
  and its tests exist. Keep that distinction.
- New to the code: `docs/onboarding.md`, then `docs/architecture.md`, then
  `CONTRIBUTING.md`. Ready-to-take tasks with acceptance criteria:
  `docs/starter-tasks.md`.

**What is open now** (everything else under Priority order is done)

| Item | What | Size | Who |
|---|---|---|---|
| 16f | FAQ page; rename the dashboard's level buttons | S | Any contributor (starter tasks 1, 2) |
| 16a | Small defects: failing-source banner wording, source names in three places, legacy locations, feed summaries, empty chat bubble | S each | Any contributor (starter tasks 3–7) |
| 16i | Team setup: demo data for local databases, formatting pass, bundle size, dependency advisories | S–M | Lead and contributors (see 16i) |
| 16h | Sources that need their own feed (NFA, MSRB, PCAOB, …) | M each | Contributor, one feed per issue; owner approves each feed |
| 16g | Security verification audit | L | Owner and lead; part 1 (two-firm access tests on a local database) can be a supervised contributor task |
| 6 | Cost optimization, remaining levers | S–M each | Owner: changes what the AI is asked and how often |
| 12, Phase 3 | Email alerts | M | Owner: skipped for now, needs an email provider |
| 14, part 2 | Registry grounding in the company scan | — | Owner: tested twice, worse both times, undecided |
| 17 | Multi-role AI architecture (Orchestrator + Skeptic) | XL | Owner: on hold |
| Live AI tests still owed | See the table under Priority order | — | Owner: needs the H.I.G. sign-in and AI credit |

**What contributors do not have, on purpose:** the hosted Supabase project's
keys, the production AI key, and the real H.I.G. sign-in. Anything in this
file that says "live", "deployed" or "on H.I.G." was done by the owner.
Contributors work on a local database (`docs/onboarding.md`), which can be
loaded with a copy of the H.I.G. test firm (`docs/local-demo-data.md`).

## Context

Two backlogs were merged into one prioritized plan: gaps flagged after
wiring up the real backend, plus a product backlog (profile/settings
screens, a landing page, and a Harvey AI overhaul). **Every item from the
original regulation-coverage audit is done, the RegWay AI overhaul (née
Harvey AI overhaul) is built and mostly live-verified, and every "Partial —
needs rework" and every numbered item from the product-realignment audit
except geopolitical monitoring, the category filter, fact provenance, and
duplicate-coverage grouping is done** — see **Completed** at the bottom for
the full list with commits and verification notes. Working tree is clean;
nothing listed there is uncommitted.

Two scope calls locked in earlier are still in effect:
- The fake "Regulatory Diff" / "Operational Implication Breakdown" sections
  were removed, not replaced with real AI analysis (already done).
- **Profile** = personal (name, email, password, sign out). **Settings** =
  firm/workspace (firm details, funds, portfolio companies).

**Firm and fund are always US-based** (confirmed with the user) — no
fund-level foreign-jurisdiction search is needed. Portfolio companies can be
based anywhere; that's the only place non-US coverage actually matters, and
it's partially handled already (see Priority order below).

**2026-10-02 (later same day):** the test account now runs on a real PE
firm (H.I.G. Capital) with real, web-verified funds and portfolio
companies spanning healthcare, tech, and aerospace/defense — see the
individual Completed entries for what each exercises. A new regulatory
source registry doc landed (`docs/Regway_US_Regulatory_Source_Master_
Registry_Comprehensive_V2.docx`); its healthcare/trade sections were
read in full and used to add 6 more tracked Federal Register agencies
(done — see Completed), with the bigger remaining opportunity captured
as Priority order item 13. The Harvey → RegWay AI rename is now fully
finished end to end (backend identifiers, not just the UI — see
Completed). Also surfaced: **no automated test suite exists** — see
Future.

**2026-10-02 (evening):** the user gave a full architecture brief for
evolving RegWay AI into a multi-role Claude pipeline (one model/provider,
still), including a dedicated Skeptic/Challenge role to cut speculative
relevance claims. Full plan now lives in
`plans/regway-ai-multi-agent-architecture.md` (linked from Priority order
item 5, kept separate since it's long). Two smaller, independent pieces
of the same brief — regulation-context grounding for the copilot and
chat save/resume — got their own Priority order items (3 and 4) since
they're cheap, high-value, and don't depend on the larger rebuild.
Priority order was renumbered to fit these in (items 1–2 unchanged, new
3–5 inserted, everything that was 3–10 shifted to 6–13).

**2026-10-04:** Phase 1 of geopolitical monitoring shipped and was verified
against live data (see "Geopolitical monitoring, Phase 1" under Completed).
Item 1 below is now its Phase 2 remainder. Audit and implementation notes:
`prompts/geopolitical-monitoring-investigate.md` and `-implement.md` (now
tracked in git, so cloud sessions can read them).

**2026-10-04 (later):** Phase 1 rechecked with full network access (see
"Geopolitical Phase 1 recheck" under Completed): the Federal Register
CAPTCHA fix (old item 1.2) is done, the feeds were checked against their
live shape and fixed, and every function was redeployed with the CLI.
Notes: `prompts/geopolitical-phase1-recheck-*.md`. Fund → company
holdings (old item 1.1) followed: `prompts/fund-holdings-*.md`, then the
geopolitical re-check: `prompts/geopolitical-rematch-*.md`.

**Scheduled matching runs for H.I.G. only (2026-10-04, owner's call):**
H.I.G. Capital is the primary test account; other firms are ignored.
`run-matching` now covers only firms listed in `scheduled_matching_firms`
(migration 0029, service-role only), and `run-matching-30min` is active
again. Enrol or remove a firm with
`insert into scheduled_matching_firms (firm_id) values ('<id>')` /
`delete from scheduled_matching_firms where firm_id = '<id>'`. Expected
spend: H.I.G.'s regulatory backlog (~160 items) clears over ~4 runs at
≈ $0.08 each, then a run costs only when new documents arrive.

**Blocker (2026-10-05): the Anthropic credit ran out again** during the
H.I.G. re-checks. Every AI call fails until it's topped up; scheduled
matching will show as failing on the dashboard banner meanwhile.

**Earlier blocker (resolved):** the Anthropic account ran out of credit mid-pass
("credit balance is too low"). Every AI-calling function fails until it's
topped up: matchers, impact analyses, RegWay AI chat, company scans. The
geopolitical re-check's AI step is the one piece shipped without a live run.

**2026-10-04 (evening, local session):** the branch was reviewed and an
automated test suite added (see Completed, "Automated tests"); four bugs it
found were fixed. Seven items were requested by the owner (password flows,
fund / company pages, the AI input's placement, scope switching in chat,
the chat sidebar, full profile context for the copilot, landing-page
animation) and the Priority order was re-sorted **easiest first** at the
owner's request, with a table mapping the old numbers to the new ones.

## Priority order

**Re-sorted 2026-10-04 (owner's call): easiest to implement first.** The
order below is by effort, not by value, so the largest item (the multi-role
architecture) is last even though it targets the product's biggest weakness.
Each item has a rough size: **S** = hours, **M** = a day or two, **L** =
several days, **XL** = a multi-phase build.

Completed entries, code comments, migrations and the notes under `prompts/`
refer to items by their numbers from before this re-sort:

| Old number | Now |
|---|---|
| 1 Geopolitical monitoring, Phase 2 | 13 |
| 2 Live regulation monitoring | 12 |
| 3 Copilot grounding | done (Completed) |
| 4 Copilot save and resume | done (Completed) |
| 5 Multi-role architecture | 17 |
| 6 Category filter on entity pages | done (Completed) |
| 7 Fact provenance | 16 |
| 8 Duplicate-coverage grouping | 15 |
| 9 Cost optimization | 6 |
| 10 Re-match discovery after settings edits | 11 |
| 11 RegWay AI overhaul, remaining verification | 1 |
| 12 Portfolio-company non-US coverage | "Watch only", after item 17 |
| 13 Source registry grounding | 14 |

### Live AI tests still owed
Tests run on **H.I.G. Capital** only (the primary test account). Verified
live so far: geopolitical matching, fund-level derived matches and their
analysis, the copilot answering from matched developments ($0.014), copilot
save / resume with multi-turn memory ($0.011), and on H.I.G. on 2026-10-04
($0.94 in total): scheduled matching (80 items, 8 relevant, sensible
verdicts, $0.15), analyses for the 8 new matches (after fixing the cut-off
below) plus the 2 re-written by re-checks (10 × avg $0.077 = $0.77), and
the geopolitical and the regulatory re-check (rows replaced, $0.017).
On 2026-10-05 the owner ran, as the H.I.G. user: the copilot opened from
GetixHealth's page (answered from its matched rules) and a PDF upload.
Later that day, signed in as the H.I.G. user with the owner's credentials:
focus switching mid-chat (firm → GetixHealth → firm; each answer followed
the switch and the stored scope updated; $0.05, test conversation deleted)
and a GetixHealth company scan ($0.22 + analyses, ≈ $0.49): real
`why_it_applies` reasons stored, but they called the company "iX Health"
(the prompts never named it, so the model guessed from the website) and
some hedged with "may". Fixed: both scan prompts name the company and rule
out assumption-based items; the 6 stored reasons were corrected.

Still owed. These need the H.I.G. user signed in in the app (the functions
take a user session; testing them by signing in as that user from a script
was refused, rightly):

| What | How to test (as the H.I.G. user) | Est. cost |
|---|---|---|
| Company scan storing a real `why_it_applies` | Change a company's HQ, sectors or regions and save (other fields don't re-scan), then read "Why it's here" on its new items | $0.20–0.70 |
| Analysis of a not-yet-published document | Only when a pre-publication item is matched to H.I.G. (none today: the 4 scheduled for 10-05 were judged not relevant) | $0.06–0.22 |
| Fund rows derived from holdings, on H.I.G. | Record which H.I.G. fund holds each company (company cards); not set yet, so no fund-level derived matches exist | $0.06–0.40 (re-written analyses) |
| **Total** | | **≈ $0.10–0.60** |

### 1. RegWay AI overhaul — remaining verification — done
Both checks settled 2026-10-05:
- File upload verified live by the owner on H.I.G. with a PDF (a page of
  notes, summarised correctly); `.txt`/`.md` go through the simpler inline
  path, covered by the unit tests.
- Full-page view on the first message, with the suggested questions
  removed once the first message is sent: **kept as built** (owner's call;
  briefly changed to keep the suggestions, then reverted). Browser test
  covers it.

### 2. Move the RegWay AI input so it's always in reach — done
See Completed, "Roadmap items 2–5".

### 3. Small fixes found by the 2026-10-04 test pass — done (footer pages built 2026-10-08)
See Completed, "Roadmap items 2–5". Still open:
- **Footer pages** ("About Us", "Sources", "Legal Disclaimers", "Privacy
  Policy"). The links that went nowhere were removed in the redesign
  (2026-10-08); the footer now carries a copyright line and "Informational
  only. Not legal advice." The pages themselves are still content to
  write, and the links come back when they exist.

Dropped: live removal of matches on an open dashboard. Supabase Realtime
can't filter delete events by firm, so every open dashboard would refetch
whenever any firm's match was deleted; and the list already refreshes when
the user comes back to it from a re-check or a holdings edit.

Noticed while testing, not changed: `match-relevance` and
`match-enforcement-relevance` store nothing for an item the model skips in
its reply, so that item is sent (and billed) again on the next run. The
geopolitical matcher records a "no verdict" marker instead. Small cost at
today's volume.

### 4. Password flows: reset link, current password, requirements — done
See Completed, "Roadmap items 2–5". **Leaked-password protection is not on:**
it isn't available on Supabase's free plan (owner checked, 2026-10-04). The
app already explains that refusal in plain words, so turning it on after a
plan upgrade needs no code change.

### 5. Copilot: read the full firm, fund and company profiles when nothing is selected — done
See Completed, "Roadmap items 2–5".

### 6. Cost optimization (S–M per lever)
Each lever is independent; lever 1 is a few lines.
Prompt caching and usage logging are done (see Completed). Measured from
`usage_events` (Sonnet 4.5 list prices, $3/$15 per M tokens, $0.01 per web
search), per call: company scan **$0.20** (web-search step $0.17 +
extraction $0.02), impact analysis **$0.06** avg (up to $0.22 on long
documents), matcher batch of 40 **$0.05**, chat message **$0.06–0.07**,
re-check **$0.01**. Levers, biggest first (2026-10-04 review):
1. **Stop pre-writing impact analyses nobody opens.** The matchers and
   company scans generate up to 8 analyses in the background for every new
   match; most are never opened. The on-demand path already exists (the
   detail page writes one when missing), so dropping the background step
   moves that cost to "only when read". Trade-off: the first open waits
   ~30–60 s.
2. **Company scans are the biggest recurring cost.** $0.20 per company,
   re-run weekly (and after profile edits) on dashboard load, plus the
   background analyses above. Options: scan less often (e.g. every 14–30
   days), cap web searches per scan (`max_uses` 5 → 3), or scan once per
   sector × location and share results across companies (results are
   public regulations).
3. **Move to a cheaper model — accuracy checked 2026-10-05, not switched.**
   Claude Haiku 4.5 is $1/$5 (3× cheaper than Sonnet 4.5). Same production
   prompts (`_shared/regulatoryJudge.ts`, `_shared/geopoliticalJudge.ts`,
   both now take a `model` option), 40 already-judged H.I.G. items per
   matcher (every item production marked relevant, plus the newest
   rejections), run once each ($0.27 in total):

   | Pair (agreement out of 40) | Regulatory | Geopolitical |
   |---|---|---|
   | Haiku vs fresh Sonnet | 38 | 39 |
   | Fresh Sonnet vs a second fresh Sonnet run | 38 | — |
   | Fresh Sonnet vs the verdicts stored in production | 27 | 39 |

   - Haiku disagrees with Sonnet as often as Sonnet disagrees with
     itself. Its 2 extra regulatory "yes" verdicts were weak (a Florida air
     plan "applies to H.I.G.'s operations in Florida"; a Medicaid rule
     GetixHealth "may" bill for), and it missed the aircraft-import
     proclamation for A.L.A. that Sonnet keeps. Cost per batch of 40:
     ≈ $0.027 vs ≈ $0.075.
   - **Bigger finding:** 13 of the 14 regulatory items stored as relevant
     for H.I.G. were rejected on a fresh Sonnet run with the same prompt,
     mostly Medicare payment-rule corrections and an RFI matched to
     GetixHealth (the "not relevant to my portfolio company" items the
     owner raised in chat). Run-to-run noise explains ~2 of 40, so most of
     the gap comes from the batch the item was judged in, or a profile
     edit since.
   - **Follow-up done (2026-10-05):** every verdict call (both matchers'
     judges, the enforcement matcher, the re-check) runs at
     `temperature: 0`. The regulatory re-check used its own, looser prompt
     (no rules against speculative links or purely administrative notices
     such as technical corrections), so a re-check kept matches the matcher
     rejects; it now uses the matcher's prompt (`judgeRegulations`) with
     the user's note appended. Tests cover both.
   - **H.I.G.'s 14 stored matches — done.** First pass (old re-check
     prompt): 3 removed, $1.21 (each kept item rewrites its analysis,
     ≈ $0.10, which the $0.14 estimate left out). Credit ran out on the
     second pass; after the top-up the 11 still kept were re-checked on the
     unified prompt: 4 more removed (Medicare IRF, IPF, SNF and hospice
     corrections), 7 kept (Form PF, BOI revision, Subpart F, GLOBE, IPPS
     correction, Part D RFI, Medicaid/CHIP rule), $0.84. A single-item
     re-check is still a little more generous than the batch matcher.
   - **Regulatory matcher switched to Haiku 4.5 (2026-10-05).** Re-test at
     temperature 0 on the same 40 items: regulatory 40/40 agreement with
     Sonnet; geopolitical 36/40, Haiku adding three links the prompt
     forbids (an OFAC designation of persons in Italy "could affect" A.L.A.)
     and missing the aircraft-import match. So `judgeRegulations` (matcher
     and regulatory re-check) runs on Haiku; the geopolitical judge,
     enforcement matcher, analyses, chat and scans stay on Sonnet 4.5.
     Verified live: a re-check on Haiku costs $0.002.
4. **Message Batches API (50% off)** for work nobody is waiting on:
   `run-matching` and any background analyses. Results arrive within
   minutes to hours, fine for a 30-minute schedule.
5. **Only match firms that are in use.** Partly done: `run-matching` runs
   only firms enrolled in `scheduled_matching_firms` (today H.I.G.). For
   real customers, enrol automatically on sign-in and drop firms with no
   sign-in in N days; dormant ones catch up on their next visit.
6. **Shorter analysis input.** Analyses read up to 60K characters of the
   document; long rules drive the $0.22 calls. A lower cap, or sending only
   the sections that mention the matched facts, cuts input tokens.

Dropped: "right-size `max_tokens`" (from the 2026-10-01 list). Output is
billed per token generated, not per token allowed, so a lower ceiling saves
nothing and risks cutting answers off.

### 7. Copilot: change the AI's scope from inside the chat — done
### 8. Copilot: chat sidebar, closable session context, attached files — done
Built together, 2026-10-05; see Completed, "Copilot: focus switching and
chat sidebar".

### 9. Fund and portfolio-company pages — done
See Completed, "Fund and company pages; day-by-day lists".

### 10. Landing page: sign-in / sign-up in place, scroll animations — done
See Completed, "Landing page: sign-in in place, scroll reveals".

### 11. Re-match discovery after settings edits — done (live run pending the owner's OK)
See Completed, "Re-discovery after profile edits".

### 11a. Inaccuracies and weak spots from the 2026-10-05 review — done
An independent check of branch `claude/eager-maxwell-1oqaw3` (tests re-run,
production compared with the hand-off report, the app clicked through as
the H.I.G. user) found the report accurate and the items below. All fixed
2026-10-05; `match-relevance`, `match-enforcement-relevance` and
`regway-ai-chat` redeployed. Checks after: type checks, 274 unit tests, 84
browser tests. Numbered 11a so later items keep their numbers.

| Found | Fix |
|---|---|
| `prompts/next-session.md` said 11 commits ahead (it was 12) and mixed 10-05 / 10-06 dates | Note rewritten for the current state, dates marked UTC |
| Hand-off report said the password flows weren't live; the build on reg-way.vercel.app (2026-10-05 02:28 UTC) has them | Noted in `next-session.md` |
| A profile-edit re-check forgot every rejection in the 200-item window but judged only 40; the rest waited for scheduled runs, or for ever on a firm not enrolled | The client repeats the matcher call until a short batch comes back (`recheckRejections` in `lib/data.ts`, at most 6 calls) |
| Rejections were forgotten before the rate-limit check | Both matchers check the limit first; a refused re-check forgets nothing and the limit is counted once |
| `addFund` always re-checked | Skipped when only the fund's name is recorded (`hasMatchingFacts`) |
| A chat stopped before its first answer stayed in the sidebar, empty (owner: must not be stored) | Server deletes the new conversation when the reader goes away before anything is saved (`cancel` on the stream); the client also removes a conversation with no saved messages after a stop or failure (`discardEmptyConversation`). The one existing empty row was deleted |
| Answers crawled when the tab wasn't in front (30 s on the server, 4 min on screen) and the chat stayed locked | The reveal is paced by elapsed time, not timer ticks |
| Profile's back button said "Back to Dashboard" when it returns to a fund / company page | `ProfileScreen` takes a `backLabel`, like the detail view |
| Suggested questions ignored the chat's focus | They name the focused fund / company, or ask about the regulation |
| Day heading repeated the date ("Tue, Sep 29 · September 29, 2026") | Weekday only beside the date ("Tuesday · September 29, 2026") |
| One analysis was generated and paid for 4 times on opening one item ($0.17) | `requestImpact` shares one in-flight request per regulation. Cause: the item had no stored analysis, React's dev-mode double effect asked twice, and reopening asked again. Not fixed: the server still doesn't refuse a second request for an analysis already being written (two tabs, two users) |

Verified live on H.I.G. during the review:
- Focus switching mid-chat ($0.05): firm question answered about the firm,
  then after switching to GetixHealth the notice showed, the answer was
  about GetixHealth, the stored scope changed and all four messages saved.
- The profile-edit re-check (02:40 UTC on 10-06): the owner added "Venture
  Capital" to the firm's strategies. Within 40 seconds 239 rejections were
  forgotten (364 → 125), `requested_at` set, 40 regulatory (Haiku, $0.02)
  and 40 enforcement (Sonnet, $0.075) items re-judged, all not relevant
  again, the 37 matches untouched, existing analyses rewritten, and the
  geopolitical matcher correctly not called. That run used the old code,
  so 153 regulatory and 5 enforcement items were left for scheduled runs.

Left open:
- **"Venture Capital" is still in H.I.G.'s strategies.** The owner removes
  it in Settings → Firm; with the fix that save re-checks to the end at
  once.
- Verified live on localhost after the fix: a new chat stopped before its
  answer left no conversation behind, and a short answer appeared at once
  in a background tab. Not yet verified live: a re-check finishing without
  waiting for scheduled runs (the owner's next profile save will show it).
- After a stop, the empty answer bubble stays on screen until the next
  message (cosmetic, not fixed).
- Deployed edge functions other than the three above were compared with
  the code by deploy time, not line by line.

### 11b. Move the site to regwayai.com (S) — done 2026-10-08, one check left for the owner
**Status 2026-10-08: the domain is live.** The owner added the DNS records
at Squarespace; `https://www.regwayai.com` serves the current build, and
`regwayai.com` and `reg-way.vercel.app` both redirect to it (308). Still to
confirm by the owner: Supabase Auth Site URL and redirect allow-list
include `https://www.regwayai.com/**` (and the bare domain), and a
password-reset email opens the new address. Search engines may list the
site as of 2026-10-08 (the `noindex` tag and the `robots.txt` block were
removed at the owner's request).

The site is on https://reg-way.vercel.app; the owner has bought
`regwayai.com`.
- Vercel: add `regwayai.com` (and `www`) to the project, set the DNS
  records at the registrar, make it the primary domain and redirect
  reg-way.vercel.app to it.
- Supabase Auth → URL Configuration: set Site URL to the new domain and add
  it to the redirect allow-list (keep the old one until the move is done).
  Sign-up confirmation, password-reset and email-change links use
  `window.location.origin`, so they fail from the new domain until it is
  allowed.
- Check the wording and links in the Supabase auth email templates.
- `index.html` has `noindex, nofollow`: decide whether the new domain
  should be indexed.
- Edge functions allow any origin (`_shared/cors.ts`), so nothing changes
  there; if that is ever restricted, list the new domain.
- Test on the new domain: sign up, sign in, password reset link, and one
  chat message.

### 12. Live regulation monitoring (near-real-time, US + global) — Phases 1 and 2 done; Phase 3 (alerts) open
**Phase 1a (2026-10-04)** and **pre-publication documents** are done (see
Completed). **Phase 2 done 2026-10-07** (see Completed, "Live monitoring,
Phase 2: regulator feeds"): nine regulator feeds (SEC, FTC, CFPB, UK FCA,
PRA and statutory instruments, EU ESMA and EUR-Lex) polled every 30
minutes, the jurisdiction pre-filter, and the enforcement and advisory
syncs moved off once-a-day.

Still open:
- **Phase 3: alerts** (email / push for high-priority items, the Morning
  Brief). Needs an email provider and the owner's choice of what counts as
  high priority.
- **CFTC**: its feeds refuse the edge functions' addresses (403). Its rules
  still arrive through the Federal Register; its announcements and
  enforcement cases don't.
- **Federal Reserve and OCC** feeds work but were left out (bank
  supervision). One registry entry each if a portfolio company is a bank.
- **Duplicates**: an SEC proposal now arrives twice, as the announcement
  and later as the Federal Register document. That is item 15.
- **Title-only items**: EUR-Lex entries carry no summary, so the matcher
  judges them on the title alone.

Original plan below for reference.

Replaces the once-a-day model. Goal: when a regulation is published, check it
against every firm/fund/portfolio company within minutes and update the
dashboard, without the AI running constantly. "Live" = polling every 15–30
min (regulators don't push; e.g. the Federal Register has no webhook). The AI
only fires when something new arrives, which is what keeps it cheap.

Pipeline: **poll (free) → pre-filter (free) → AI match (only survivors) →
live dashboard.**
1. **Poll**: pg_cron every 15–30 min runs a sync function that pulls new items
   into `regulations` (deduped by source + external id). No AI.
2. **Pre-filter**: compare each new item's jurisdiction/agency/industry with
   what each firm and company actually has (HQ, operating locations,
   industries from the questionnaire). Most items drop out here.
3. **AI match**: batch what's left per firm through the existing
   `match-relevance`, which already checks a regulation against the firm, its
   funds and its portfolio companies in one call. Service-role path is
   already exempt from the per-user rate limit.
4. **Live dashboard**: Supabase Realtime on `regulation_relevance` so new items
   appear with a "New" badge, no refresh. Keep the weekly per-company web
   search (`company-regulations`) as a safety net for gaps.

Phases
- **Phase 1**: 30-min polling of Federal Register (+ its public-inspection
  list, which shows documents before publication), event-triggered matching
  with the pre-filter, Realtime updates + "New" badges.
- **Phase 2**: US regulator feeds (SEC, FINRA, CFTC, FTC, …) then UK (FCA,
  Bank of England, legislation.gov.uk) and EU (EUR-Lex, ESMA). Believed to
  offer RSS/Atom feeds — verify each in the investigation step before building.
  Open question: confirm UK + EU as the first global sources.
- **Phase 3**: email/push alerts for high-priority items and the Morning Brief
  (uses the per-fund notification preference already stored).

Caveats
- No single global feed exists: every jurisdiction is its own connector.
  Anywhere without one falls back to the web-search scan, driven by each
  portfolio company's HQ country.
- Estimated cost (not measured): ~$0.03–0.05 per firm per match batch; with
  the pre-filter and 1–5 batches/day roughly $1.50–7 per firm per month.
  Usage logging now exists (`usage_events`, see Completed) so this can
  become measured once there's real traffic.
- Cost levers if needed: scan by industry × jurisdiction instead of per
  company (results are public regulations), Batch API for overnight work,
  fewer web searches / Haiku for the structuring step, skip AI when nothing
  new applies to a firm.
- Supersedes the "per-firm scheduled, timezone-aware relevance checks" item
  below (event-driven removes the need for per-firm schedules); the
  timezone still matters for when the Morning Brief email is sent.

### 13. Geopolitical monitoring, Phase 2 — UK / EU sanctions done; the false positive waits for item 17
**UK and EU sanctions done 2026-10-07** (see Completed, "Geopolitical
Phase 2: UK and EU sanctions"). OFAC has no usable recent-actions feed and
keeps arriving through the Federal Register.

Still open:
- **One known residual false positive** in the H.I.G. test data: a
  Section 301 "manufacturing sectors" investigation matched to 3Pillar
  Global (software) via India. The model's own reason says the sector fit
  isn't confirmed. Left in place as an honest example of the limit, not
  fixed by more prompt tuning. Same class seen on the holdings test firm
  (2026-10-04): a drone-export rule matched to an aerospace-logistics
  company "if it manufactures UAVs … not recorded". A structural fix is
  the Skeptic pass (item 17), not another prompt rule.
- **Not exercised live with a firm the new sources match**: no test firm
  has a recorded location both in a sanctioned country and in the UK / EU.
- The EU publishes each action as two instruments, so two rows (item 15).

### 14. Ground AI matching/search in the regulatory source registry doc — DDTC done; prompt grounding tested and not shipped
From `docs/Regway_US_Regulatory_Source_Master_Registry_Comprehensive_V2.docx`
(52 sections, federal through tribal / county / licensing-board level; its
own §50 says the state and local layers can't be enumerated and must be
resolved per entity). Notes: `prompts/source-registry-grounding.md`.

1. **DDTC / ITAR coverage: done 2026-10-07.** A `defenseTradeControls`
   feed in `sync-federal-register`: State Department rules and proposed
   rules whose title names the ITAR or the U.S. Munitions List (15 of the
   department's 33 rules in a year, and none of the other 18), filed as
   geopolitical like BIS export controls.
2. **Feeding the registry into the company scan's search prompt: built,
   tested live, not shipped.** On GetixHealth the scan as it is found 8
   items; with the registry's sources added it found 2 (both too old), and
   with a lighter version 0. The list pulls the model into one generic
   search per regulator and away from "what changed recently for this
   activity", and five searches don't cover both. The code was removed.
   Untested alternatives: use the registry to filter results after the
   search; give the scan more searches first; use it to choose which
   agencies' Federal Register documents each firm's matcher reads.

### 15. Duplicate-coverage grouping — done
One card per development, with its other versions as "also published as"
links (owner's choice). See Completed and `prompts/duplicate-grouping.md`.

### 16. Fact provenance and "last confirmed" dates — done
Every profile fact shows where it came from and when it was last
confirmed; blanks show as unknown, in the forms and to the AI. See
Completed and `prompts/fact-provenance.md` (including what was left open:
no document upload, no record of which user confirmed).

### 16a. Open items, inconsistencies and questions from the 2026-10-05 to 10-08 session
Everything this session left unbuilt, found wrong, or could not decide
without the owner. Nothing here is started. Sizes are rough.

#### Not built, or left for later

Skipped by the owner's call:
- ~~11b, move to regwayai.com~~: done 2026-10-08 (item 11b).
- **12 Phase 3, email alerts** (M). Needs an email provider and a
  definition of "high priority" (see Questions).

Sources:
- **CFTC feeds** answer 403 to Supabase's addresses, so they are not
  polled; CFTC rules still arrive through the Federal Register. No
  workaround tried (a proxy, or a different CFTC endpoint).
- **OFAC** has no usable recent-actions feed; it arrives through the
  Federal Register only, days later than OFAC's own site.
- **UK / EU sanctions matching is untested against a firm it should
  match**: no test firm has a location in both a sanctioned country and
  the UK or EU. On H.I.G. all 14 items were pre-filtered (correctly).
- **Item 14 part 2 (registry in the company-scan prompt)**: tested live
  twice, both worse than today's scan (8 items → 2 → 0), not shipped.
  Whether to try a different approach is a question below.
- **UK and EU announcements are not paired with their later
  instruments** (FCA policy statement and the handbook instrument, ESMA
  and EUR-Lex); only SEC / FTC / CFPB announcements are.

Duplicate grouping (item 15):
- **The card's analysis is written from the first version.** When the
  official Federal Register text arrives, the announcement's analysis is
  not rewritten from it (the fuller text has the dates and thresholds).
- **Near-identical results inside one company scan** are not grouped
  ("Amendments to 23 NYCRR Part 500" twice for one company; the German
  battery act twice). A scan-prompt or scan-dedup matter.
- **A later version opened where it stands alone has no analysis ready**:
  it is written on first open (30 to 70 seconds), because preparing it
  ahead is skipped when the firm already sees the first version.
- **The announcement rule has no review step**: its links (the only ones
  an AI makes) go live at once. All 8 so far were read and correct. An
  unlink control or a periodic read of new links does not exist.

Fact provenance (item 16):
- **No document upload**: a "supporting document" is a name or link the
  user types, and nothing checks that it says what the answer says.
- **Which user entered or confirmed an answer is not recorded** (a firm
  can have several members).
- **Matchers do not read provenance**: only analyses and chat are told
  what is not recorded or over a year old.
- **A development's page does not show the dates of the facts its match
  rests on** (spec: "Where the match depends on an unconfirmed fact, the
  page states that dependency").
- **Answers entered before 2026-10-08 are undated** until someone presses
  "Still correct" or "Confirm all". Not back-dated on purpose.

From the 11a review, still open:
- The server does not refuse a second analysis request for the same
  development while the first is running (the client now does).
- After stopping a chat answer, the empty answer bubble stays until the
  next message.
- A possible first-click miss on the dashboard's "Ask RegWay AI" bar, seen
  once, not reproduced.
- Deployed functions other than the ones redeployed this session were
  compared with the code by deploy time, not line by line.

Other:
- ~~Footer pages do not exist~~: built 2026-10-08 (item 16e): About,
  Sources, Legal disclaimers, Privacy.
- **The known false positive** (the Section 301 manufacturing
  investigation matched to 3Pillar) is parked in item 17.

#### Not verified
- **UK / EU sanctions matching** against a firm it should match (see
  Sources above).
- **A re-check running to the end from the browser** after a profile
  save (item 11a's fix) was not watched live.
- **The "last confirmed over a year ago" marker to the AI** has unit
  tests only; nothing on H.I.G. is that old.
- **Saving a confirmation or a document on real data**: the assistant
  only read H.I.G.'s Settings page; it does not save changes to a real
  profile through the browser.

Verified on 2026-10-08 with the owner signed in on localhost (H.I.G.):
- Item 15: on the firm page the crypto custody proposal is one card with
  "Also published as: Federal Register · Oct 6, 2026", the retailization
  proposal one card with two Federal Register links, and the
  development's page lists the document in its sidebar.
- Item 16: Settings → Firm shows "Recorded on or before Oct 7, 2026 · not
  confirmed since" with "Still correct" and "Add document" under each
  answer, and "Unknown" on the four blank optional facts.
- Scheduled matching recovered after the credit top-up (01:40 UTC run
  succeeded).

#### Inconsistencies found
- **The AI account ran out of credit with no warning** (00:28 to about
  01:13 UTC on 10-08). Matching, analyses and chat all failed; the only
  sign was the dashboard banner, which says the source "hasn't updated
  successfully recently" and not why. Nothing watches the balance or the
  daily spend.
- **A profile edit can cost close to a dollar without saying so**: the
  "Venture Capital" removal re-judged the backlog and rewrote 14 analyses
  ($0.83). The form gives no hint that a save does this.
- **Every analysis includes the firm, whether or not the firm was
  matched** (`_shared/impact.ts` always lists the FIRM line). The
  "Transparency in Coverage" analysis, matched to GetixHealth only, asks
  five open questions about H.I.G. Capital's own health plan.
- **An analysis doubted that a portfolio company belongs to the firm**:
  the regenerated ITAR analysis says "if H.I.G. does not hold A.L.A., no
  connection to the firm exists", because fund holdings are not recorded
  for H.I.G. A portfolio company on the firm's own list is the firm's.
- **`regulation_impacts.created_at` keeps its first value when an
  analysis is regenerated**, so there is no way to tell when the text on
  screen was written. Needs an `updated_at`.
- **Legacy locations with a full state name are misread**:
  `parseLegacyLocation("Miami, Florida")` gives city Miami, *country*
  Florida (only two-letter state codes are recognised). Affects rows that
  have `hq_location` but no `profile.hq`; H.I.G. is not one.
- ~~The development page's "History" control does nothing~~: removed in
  the redesign (item 16d). If a real history of a development is wanted
  (how its status changed over time), that is a feature to design.
- ~~The development page shows the raw source id~~: fixed in the redesign;
  it shows "Federal Register", "SEC announcement" and so on. Source names
  still live in three places (`data.ts` SOURCE_LABELS,
  `duplicates.ts` SOURCE_NAMES, the landing page's list).
- **"JWT issued at future"**: the database now and then refuses a newly
  started function's first query. Two functions retry it
  (`sync-regulator-feeds`, `group-duplicates`); the rest fail the run.
- **The one-year staleness threshold is defined twice** (client
  `questionnaire.ts`, server `entityFacts.ts`).
- **Test spending outside the app's records**: about $0.50 of direct API
  calls for the registry tests (item 14) used the key in `.env.local` and
  are not in `usage_events`.
- **EUR-Lex is down on its side** (seen 2026-10-08): since 23:05 UTC on
  10-07 the whole site, feeds included, redirects to a bare "today's
  Official Journal" page, so `eur_lex` and `eu_sanctions` bring nothing in
  and the dashboard shows the failing-source banner. Nothing to fix here
  unless it lasts; check
  `select ran_at, ok, detail from sync_runs where source = 'regulator_feeds' order by ran_at desc limit 3`.
- **The failing-source banner is vague and ungrammatical**: "Regulator
  feeds (U.S., UK and EU) hasn't updated…" when only the two EU feeds are
  down and the other nine are fine. It should name the feed.
- **Feed summaries show raw HTML entities**: the FCA card reads
  "…These include:&nbsp;Guidance focused…" with sentences run together.
- **Some enforcement cards repeat the title as the summary** ("Stephen
  Kenneth Leech" twice).
- **Items about a company are listed on the firm page**: the UK
  Employment Rights Act and the EU Customs Code cards on H.I.G.'s firm
  list both say "applies to A.L.A. S.p.A." in their reason. The verdict
  was stored for the firm, not the company.
- **A weak match**: an EPA approval of Florida's air-permit forms is on
  the firm page because H.I.G. is headquartered in Florida ("any
  portfolio companies with air emissions in Florida"). No recorded fact
  supports it. For item 17's Skeptic.
- **The owner's screenshot about the $100 credit could not be opened**
  (file permission), so the question "don't I have $100 in credit" was
  never answered from it.

#### Questions for the owner, with the answers given on 2026-10-08
1. **Credit**: the server's key belongs to the "regpe" Anthropic
   organisation. No low-balance alert wanted.
2. **Email alerts**: skipped for now.
3. **Domain**: done 2026-10-08. The site is https://www.regwayai.com.
4. **Footer pages**: built 2026-10-08 (item 16e). The owner has not yet
   read the wording, and they need a contact address (see 16e).
5. **Duplicates**: yes to both. Done as 16b.1.
6. **Provenance**: the owner asked for the options to be explained before
   deciding. As put to them: today "Add document" stores only a label you
   type (a name or a link); RegWay never sees the document. The
   alternative is uploading the file, which lets RegWay keep it, show it
   next to the answer and, if wanted, have the AI check that the document
   really says what the answer says (and suggest answers from it). That is
   a larger build (file storage, access rules, an AI reading step with its
   own cost). **Decided 2026-10-08: keep the typed label.** Why the field
   exists at all, as explained to the owner: the product's promise is that
   every match can be traced to a fact someone stands behind. The label
   records what that fact rests on ("Form ADV, March 2026") beside who
   entered it and when it was last confirmed, so a colleague or an auditor
   can ask "says who?" and get an answer, and so the AI is told which
   facts are documented and which are only asserted. It costs one optional
   field. Still open: whether one year is the right age to ask for
   re-confirmation; whether to record which user confirmed.
7. **Profile edits that cost money**: wait about five minutes after the
   last edit before spending AI credit, since a user often changes several
   things in a row. Done as 16b.2.
8. **Scheduled matching beyond H.I.G.**: for now H.I.G. only (owner,
   2026-10-08). Other firms are matched at onboarding and on profile edits.
9. **CFTC and OFAC through the Federal Register only**: unanswered.
10. **Registry grounding (item 14 part 2)**: unanswered.
11. **Item 17**: on hold until the owner says.

### 16b. Decided on 2026-10-08 — done
Notes: `prompts/16b-decided-tasks.md`. See Completed.
- **16b.1** The official document replaces its announcement as the card.
- **16b.2** AI work waits five minutes after the last profile edit.
- **16b.3** Dark mode.

Left open by these three:
- Notes and flags made on an announcement stay with it, and it is no
  longer shown once its document is.
- A document from a package that was judged not relevant (the
  interval-fund rule on H.I.G.) is no longer linked from the page.
- A real profile edit going through the five-minute wait and re-judging
  items was not watched live (test rows were).
- The theme choice is kept per browser, not per account. The onboarding
  wizard, password-reset screen, fund / company pages and dismissed list
  were not looked at in dark.
- Onboarding still runs the matchers at once (not an edit).

### 16c. Frontend tooling (from the owner, 2026-10-08) — installed
Five Claude Code add-ons for frontend work, sent by the owner as a list
("5 Claude Code Plugins for Better Websites"). All five were installed on
2026-10-08 and used for the redesign (item 16d): the Taste Skill set (14
skills) and Web Design Guidelines in `.claude/skills/` (`skills-lock.json`
records their versions), Playwright CLI globally (`npm i -g
@playwright/cli`) with its skill in `.claude/skills/playwright-cli`, and
Awesome Design as the model for RegWay's own `DESIGN.md` (its files
describe other companies' sites, so none is kept in the repo; fetch one
with `npx getdesign@latest add <site>`). Two links in the list had typos (the
taste-skill owner is `Leonxlnx`, with a lowercase L; "SKILL.ma" is
`SKILL.md`).

| Add-on | What it is | Use here | Note |
|---|---|---|---|
| Taste Skill, tasteskill.dev (`npx skills add Leonxlnx/taste-skill`) | 13 instruction files that push an AI coding agent away from generic-looking UI: type, spacing, colour, layout, motion; includes a "redesign an existing project" audit. MIT. | A pass over the landing page and dashboard for polish. | Third-party instructions that run inside the agent: read them before installing. |
| Web Design Guidelines, `vercel-labs/agent-skills` | Reviews UI code against Vercel's Web Interface Guidelines and reports `file:line` findings (accessibility, focus, forms, motion). | An accessibility and UX audit of `src/components`, most useful right after dark mode. | It downloads its rules from GitHub at every run, so what it checks can change without notice. |
| Image to Code, `Leonxlnx/taste-skill` (`skills/image-to-code-skill`) | Generates design images first, then writes the frontend to match them. | Little: RegWay has an established look. | Written for OpenAI's Codex and needs an image-generation tool. |
| Awesome Design, `VoltAgent/awesome-design-md` | 73 `DESIGN.md` files, each describing a well-known site's design system (colours, type, components, do's and don'ts) for an agent to follow. MIT. | Write RegWay's own `DESIGN.md` from the theme variables added in 16b.3, so future UI work stays consistent. Copying another brand's file is not the goal. | The files describe other companies' visual identities. |
| Playwright CLI, `microsoft/playwright-cli` (`npm i -g @playwright/cli`) | Command-line browser control for agents: record, inspect selectors, screenshot. Lighter on context than the Playwright MCP server. Apache-2.0. | Checking screens while working, in place of the throwaway screenshot tests used this session. The project's own browser tests already use Playwright. | From Microsoft; lowest risk of the five. |

Suggested order if any are adopted: Playwright CLI (tooling only), then a
`DESIGN.md` for RegWay, then one Web Design Guidelines audit. Questions for
the owner: which of these do you want installed, and is the aim a redesign
or an audit of what exists?

### 16d. Redesign with the five add-ons (2026-10-08) — done and merged
Owner: "install all of them. Then redesign our app from what you learned
from those plugins. But keep the same colors and improve everything else."
Notes: `prompts/redesign.md`. The rules the UI now follows: `DESIGN.md`.
Merged into `main` and live the same day, after the owner's changes in
item 16e (which replaced the colours this item had kept).

Left open by it:
- **"Export Memo"** in the chat header was removed: it had no handler. A
  real export (the conversation as a document) is a feature to build if
  wanted.
- **Not looked at in a browser**: the fund and company Profile cards
  opened in dark mode, the password-reset screen, the dismissed list with
  items in it, tablet widths between 768 and 1024px, and Safari/Firefox.
  All screens were checked in Chromium at 1440px and 390px, light and dark.
- **Bundle**: the script is 647 kB (179 kB gzipped) in one file. Splitting
  the chat drawer and the profile screens into their own chunks would cut
  the first load.
- ~~URLs: one address for every screen~~: done in item 16e.
- **Company logos** are loaded at whatever size was uploaded.
- ~~Geopolitical violet and enforcement amber beside the accent~~: both
  labels are grey since the palette change in item 16e.
- **Image to Code and the image-generation skills** (`imagegen-*`,
  `brandkit`) are installed and unused: they need an image generator,
  which this setup doesn't have.

### 16e. After the redesign: the owner's changes, the domain, pages and addresses (2026-10-08) — done
Everything asked for after the redesign was first shown, all on `main` and
live at https://www.regwayai.com. Summary in Completed ("16e").

Left open by it:
- **Public pages need the owner's read, and two facts.** About, Sources,
  Legal disclaimers and Privacy describe only what the product does today.
  They were written by the assistant, not a lawyer. They show no contact
  address (`CONTACT_EMAIL` in `InfoPage.tsx` is unset) and do not name the
  company behind RegWay or a governing law, because neither was given.
- **Privacy names its service providers by kind, not by name** (hosting,
  database and sign-in, AI model provider), because the owner asked for
  the AI vendor's name to be taken out of the site. A privacy page usually
  names them; the owner's call.
- **Supabase Auth settings for the new domain** are the owner's to
  confirm (item 11b).
- **The dashboard's three levels have no address of their own**: `/` is
  the dashboard whichever level is open.
- **A development opened from its address alone** (a pasted link, a
  reload) shows the document and its analysis but not the "Also published
  as" links until they load, and nothing checks that it was ever matched
  to the viewer's firm (any signed-in user can read any public document).
- **Closing the browser tab mid-answer** still loses the answer; only
  closing the chat panel is covered. Needs the server to finish on its own
  and a way for "Stop generating" to reach it.
- **Chat items from the owner's pasted instructions, not built**: rename,
  pin and archive conversations; thumbs up/down and share on answers;
  citations attached to sentences; saving an answer as a note or flag; an
  "Analyzed N sources" line.
- **Not looked at in the new colours**: Profile, the development page,
  tablet widths, Safari and Firefox.
- **Search listing**: the owner verified the domain in Google Search
  Console and requested indexing on 2026-10-08. Whether it is listed has
  not been checked since.

### Test data on H.I.G. (added 2026-10-08 at the owner's request)
Written straight to the database, to give the app more to show. Every
added name ends in "(test)" so it can be told apart and removed.
- **Funds added (3)**: H.I.G. Europe Partners (test), Luxembourg SCSp;
  H.I.G. Growth Fund (test), Delaware LP; H.I.G. Infrastructure Fund
  (test), Cayman LP.
- **Companies added (4)**: Meridian Pay (test), a New York consumer
  payments and lending app; Brightwell Wealth (test), a London
  FCA-authorised wealth manager; Rheintal Batterie GmbH (test), a
  Stuttgart battery maker with Chinese and Korean suppliers; Cascade
  Pipeline Services (test), a Houston pipeline-services company with
  government contracts. All four are invented.
- **Holdings recorded (8)**: 3Pillar Global → Advantage Buyout Fund;
  GetixHealth → Capital Partners VII; A.L.A. → Europe Partners (test);
  Brightwell and Rheintal → Europe Partners (test); Meridian Pay → Growth
  Fund (test); Cascade → Infrastructure Fund (test) and Capital Partners
  VII (one company in two funds, on purpose). **The three real companies'
  funds are the assistant's assignment for testing, not checked against
  H.I.G.'s actual holdings.**
- **Cost it sets off**: each new company is researched the first time the
  dashboard is opened (about $0.20 a scan plus about $0.06 for each
  analysis written), and one geopolitical re-check was queued. Expect
  roughly $2 to $3 in total.
- **To remove**: delete the funds and companies whose names end in
  "(test)" in Profile; their holdings go with them.

### 16f. Asked for by the owner on 2026-10-08, not started
- **FAQ page** (S–M). A fifth public page at `/faq`, linked from the footer
  and the page nav (`PAGES` in `src/lib/router.ts`, `InfoPage.tsx`). Needs
  the questions: suggested set is what RegWay is, who it is for, where the
  data comes from, how matching works and how wrong it can be, what the AI
  sees, what it costs, how to get access.
- **Rename the dashboard's level buttons** (S): "PE Firm" → "General
  Partners", "Fund Structure" → "Funds". Also the same words wherever they
  label the same thing (the chat's session context, Profile tabs already
  say "Funds"), and the tests that click them by name.

### 16g. Security verification audit (L) — asked for by the owner 2026-10-08, not started
RegWay holds what a firm would not want seen: which companies each fund
holds, where they operate, what regulators they answer to, and the
questions people ask about them. The owner wants this checked properly
before more firms use it. Nothing below has been done; it is the list to
work through, most serious first.

1. **Who can read what (row-level security).** Every table, one by one:
   can a signed-in user of firm A read or change firm B's rows? Includes
   `firms`, `funds`, `portfolio_companies`, `fund_holdings`,
   `regulation_relevance`, `regulation_impacts`, notes, flags, dismissals,
   `regway_ai_conversations` / `regway_ai_messages`, `profile_changes`,
   `usage_events`, storage buckets (logos). Test with two real accounts,
   not by reading the policies. Run Supabase's security advisors.
2. **Edge functions.** Each one: does it check the caller's session, take
   the firm from the session and never from the request body, and refuse a
   company or conversation id that belongs to another firm? Which ones can
   be called with no session (the scheduled ones) and what stops a
   stranger calling them? CORS allows any origin (`_shared/cors.ts`).
3. **Secrets.** What is in the browser bundle (only the publishable key
   should be), what is in the repository's history, where the AI key and
   the service-role key live and who can read them. `.env.local` holds an
   AI key used for direct test calls.
4. **Sign-in.** Password rules and the breached-password check (done),
   rate limits on sign-in, sign-up and reset (none of our own today, see
   Future), session length, email-change and reset-link handling, whether
   two-factor sign-in is needed for this kind of customer.
5. **What goes to the AI provider.** Exactly which profile facts, chat
   text and attached files are sent, the provider's retention terms, and
   whether a firm can be promised its data is not used for training.
   Prompt injection: a published document or an attached file that tells
   the model to do something (the chat has web search and reads files).
6. **The browser.** The chat renders model output as HTML through our own
   Markdown renderer (escaped, unit-tested, one e2e test for script
   injection): review it again now that tables, links and code blocks were
   added. Cached firm data sits in `localStorage` until sign-out. No
   Content-Security-Policy or other security headers are set
   (`vercel.json` has only the rewrite).
7. **Addresses.** `/developments/:id` shows any public document to any
   signed-in user (fine: the documents are public) but must never show
   another firm's reason or analysis. Check `regulation_impacts` access by
   id.
8. **Dependencies and platform.** `pnpm audit`, the three add-on skill
   packs in `.claude/skills/` (third-party instructions run with the
   agent's permissions), Supabase and Vercel account access (who has it,
   two-factor on those accounts), database backups and whether a restore
   has ever been tried.
9. **Records.** No audit log of who read or changed what. Whether one is
   needed for the customers this is sold to.
10. **An outside test.** After the above, a penetration test by someone
    who did not build it, and a decision on SOC 2: buyers at PE firms will
    ask.

### 16h. Source coverage against the registry document (2026-10-08) — Federal Register group done; the rest not started
The owner asked whether every source in
`docs/Regway_US_Regulatory_Source_Master_Registry_Comprehensive_V2 (1).docx`
has been added. No. Compared by name on 2026-10-08:

- **Read before this item**: the Federal Register for 21 agencies (SEC,
  CFTC, IRS, Labor, EPA, FERC, HHS, FMCSA, CFPB, Federal Reserve, OCC,
  FDIC, FinCEN, FTC, NLRB, FDA, CMS, DEA, OFAC, BIS, CBP) plus USTR, ITAR
  rules and presidential documents; SEC, FTC and CFPB announcements; SEC
  litigation releases and administrative proceedings; FINRA disciplinary
  actions; State Department travel advisories; UK FCA, PRA, legislation
  and sanctions; EU ESMA, EUR-Lex and sanctions. Because Labor and HHS are
  read as whole departments, their parts (OSHA, EBSA, Wage and Hour, MSHA,
  OFCCP; HHS OCR, OIG, CDC, SAMHSA) come with them.
- **Added 2026-10-08 (done, deployed)**: 43 more Federal Register
  agencies, each checked for nine months of volume first: NCUA, FHFA, HUD,
  Farm Credit, PBGC, FSOC, the Investment Security Office (CFIUS), EEOC,
  CPSC, FCC, NIST, NTIA, USPTO, Copyright Office, Energy, NRC, BSEE, BOEM,
  NHTSA, FRA, PHMSA, FTA, FMC, STB, MARAD, TSA, USITC, Defense and GSA
  (which carry the FAR and DFARS), SBA, FSIS, APHIS, AMS, FNS, BLM, Fish
  and Wildlife, Forest Service, OSMRE, Army Corps, TTB, ATF, Education,
  Postal Service. About 940 documents in nine months, roughly 3.5 a day.
  The FAA, the Coast Guard and NOAA have their own feeds that drop their
  routine, place-specific rules (airworthiness directives and airspace
  changes; safety zones and drawbridge schedules; fishery quotas): 783 →
  59, 374 → 15 and 234 → 4 documents over the same nine months.
- **Deliberately left out**: parent departments (Transportation, Homeland
  Security, Commerce, Treasury, Agriculture, Interior, Justice), because
  their bureaus are listed one by one; the Postal Regulatory Commission
  and Veterans Affairs (no rules a portfolio company would be matched
  to). USCIS, the FAR Council, the International Trade Administration and
  the National Indian Gaming Commission publish nothing under their own
  names; USCIS rules appear only under Homeland Security, so **immigration
  and employment-eligibility rules are still not read**.
- **To watch after this change**: the extra matching cost on H.I.G. (the
  estimate is under $0.20 a month: about 100 more documents a month at
  $0.05 per batch of 40) and whether the new agencies produce weak
  matches. Notices from these agencies are still not read, only rules and
  proposed rules.
- **Not Federal Register, each needs its own feed**: NFA, MSRB, PCAOB,
  NERC, Fannie Mae / Freddie Mac / Ginnie Mae guides, NAIC, DOJ and U.S.
  Attorney press releases, HHS OIG and EPA enforcement, CFTC and CFPB
  enforcement pages, court decisions, Congress.gov, Regulations.gov
  dockets, the Unified Agenda.
- **Sections 37 and 39–52 (state, territory, county, city, tribal,
  licensing boards, state privacy and AI laws)**: none read directly. The
  document itself says these cannot be listed in advance and must be
  resolved per company; today only the per-company web search reaches
  them, with no guarantee.
- **Next, if wanted**: the bodies that need their own feed (above), then
  choosing which agencies each firm's matcher reads from its recorded
  industries (the registry's own routing rule: match on activity, not only
  industry), which is free and would cut the noise the wider list adds.


### 17. RegWay AI: multi-role agentic architecture (Orchestrator + Skeptic) (XL)
Full plan: `plans/regway-ai-multi-agent-architecture.md` — linked out
rather than inlined here because the brief is long (architecture, 7
roles, routing, parallelism, structured outputs, security, failure
handling, cost/latency, 10 implementation phases, evaluation criteria,
acceptance criteria). **Stays on Anthropic Claude only** — "multi-role"
means several specialized prompts/instructions executed by the same
model, orchestrated server-side, not multiple AI vendors.

Short version: today's `regway-ai-chat` is one Claude call doing
everything (`Orchestrator == Researcher == Synthesizer`). The brief
splits this into an Orchestrator that dynamically routes to specialized
roles — Regulatory Researcher, Company/Firm Context Analyst, Impact
Analyst, **Skeptic/Challenge Agent** (does not exist anywhere today —
actively tries to break each conclusion: source authority, proposed-vs-
final confusion, unstated company assumptions, speculative connections,
missed exemptions, "could the opposite be true"), Citation/Evidence
Checker, and a Final Synthesizer — run only when the question actually
needs them, with independent roles in parallel.

This directly targets a problem already documented twice in this
roadmap's Completed section (the "Relevance-matching prompt fix" and the
"Match correction loop" — both already-shipped attempts at the same
underlying issue: relevance reasoning drifting speculative). A Skeptic
role is a structurally separate second pass with its own context window,
which a single self-consistent prompt can't reliably do for itself.

Most of the plumbing already exists and should be reused, not rebuilt:
`_shared/impact.ts`'s forced-structured-output pattern (the schema
mechanism every new role reuses), `_shared/relevance.ts`'s firm/fund/
company loaders (the Context Analyst's foundation), `_shared/usage.ts`'s
`recordUsage()` (per-role cost tracking, just needs a distinct
`function_name` per role), and this session's `rematch-regulation` (a
single-shot re-verification call the Skeptic naturally layers onto).

The two prerequisites from the same brief are done (copilot grounding and
chat save/resume, see Completed). Last in this list only because the list
is now sorted easiest first and this is the largest item: it remains the
structural answer to the product's most-scrutinized weakness (speculative
relevance matching). Order within the brief's own phases: architecture
definition → Researcher extraction → Context Analyst → Impact Analyst →
**Skeptic + Citation Checker** → dynamic routing → parallel execution →
evaluation. Do not build past Phase 1 without confirming scope: this is
comparable in size to geopolitical monitoring.

### Watch only: portfolio-company non-US coverage
No work planned (was item 12).
`company-regulations` already builds its search query from a portfolio
company's real HQ location/region and explicitly asks for foreign
regulators when applicable — this works today via live Claude web search,
not a fixed feed. Not guaranteed complete (web search quality varies by
jurisdiction). Revisit only if real usage surfaces specific gaps for a
specific country — don't build ahead of an actual problem.

### Buffer — stretch, only if time remains
- Clean up the two duplicate "NovaPay" test rows in the DB (harmless,
  RLS-isolated, just tidiness — lowest priority item in the whole list).

### Future (no timeline yet)
- ~~Continuous integration~~: done 2026-10-11 (`.github/workflows/ci.yml`;
  see Completed, "Team onboarding").
- **Per-firm scheduled relevance checks, timezone-aware**: today
  `match-relevance` only ever runs once at onboarding or when manually
  triggered — there's no recurring "check what's newly relevant to my firm"
  schedule at all. When this gets built, it should run at each firm's own
  local time, not a single global UTC time — captured via the browser's
  `Intl.DateTimeFormat().resolvedOptions().timeZone` (once, e.g. during
  onboarding or in the Settings screen, stored as a new `timezone` column on
  `firms`), not re-detected on every visit. This is distinct from
  `sync-federal-register`'s schedule, which stays global — it fetches the
  same public data for everyone regardless of firm, so there's no reason to
  run it per-tenant. Depends on deciding whether firing an actual per-firm
  cron job per signup is the right mechanism at scale vs. a single scheduled
  sweep that checks all firms and respects each one's preferred hour.
  Superseded by "Live regulation monitoring" (item 12) if that ships first.
- **Tune rate limits based on real usage**: the 15/hour (`match-relevance`,
  `company-regulations`, `match-enforcement-relevance`, `rematch-regulation`
  at 20/hour) and 30/hour (`regway-ai-chat`) limits added are reasonable
  starting guesses, not measured against real usage patterns yet. Revisit
  once there's actual traffic to look at (usage logging now exists to
  inform this).
- **Rate limit the public auth endpoints**: signup, sign-in, and the
  forgot-password flow (`resetPasswordForEmail`) are all public and
  unauthenticated — unlike the AI-calling functions above, `check_rate_limit`
  doesn't apply to them (it reads `auth.uid()`, which doesn't exist yet at
  signup/sign-in, and a password-reset requester generally isn't signed in
  either). Supabase has its own default per-project email-send throttling on
  signup/reset emails, but that's a platform-wide backstop, not an
  app-level control — e.g. nothing stops repeated sign-in attempts against
  one email. Needs its own approach (IP- or email-keyed, not user-keyed) if
  abuse becomes a real concern; not urgent pre-launch, but shouldn't be
  forgotten once the app is public.
- **Exercise account flows live**: email change (confirmation email) and
  password change on the Profile Account tab were built and type-checked but
  not run end to end. Mobile layout of the newer screens isn't visually
  confirmed either.
- **Companies with no HQ location** get much weaker scan results; consider
  requiring HQ location when adding a portfolio company.
- **Company enrichment + confirm screen** (from the onboarding PDF): after a
  company is added, research public facts (description, subsidiaries,
  licences, government contracts, agencies, filings) and let the user
  Confirm / Edit / Not sure. Would pre-fill the "complete later" answers.
- **Morning Brief / alerts**: the fund notification preference and the
  proposed-vs-final preference are stored but nothing sends email yet; brief
  recipients question deferred until there are multi-user firms.
- **Multi-user firms** (PDF's "select existing users" questions, investment
  owner per company) — tenancy is one user per firm today.

### Explicitly deferred (not prioritized)
- **SEC EDGAR full-text search integration** (`efts.sec.gov`) — not a
  source of new regulations (it's where companies/advisers file *in
  response to* rules, e.g. 10-Ks, Form ADV/PF, comment letters, no-action
  letters). Could be a genuinely useful complementary feature later (e.g.
  cross-referencing comment letters against a proposed rule), but it's a
  different feature from regulation coverage — don't conflate the two, and
  don't build until there's a concrete use case for it.
- State-level US regulation coverage (Delaware, NY, CA, etc.) — real
  multi-source data-integration work, no dedicated free API equivalent to
  Federal Register exists per state.

## Completed

### Team onboarding (2026-10-11, PR #6)
Prepared the repository for eight contributors and a lead. No application
code changed.
- **CI** (`.github/workflows/ci.yml`): type checks, unit tests, build and
  browser tests on every pull request and push to `main`; a pull request
  that edits an existing migration fails. No secrets. Verified: both jobs
  green on PR #6.
- **Review rules**: `.github/CODEOWNERS` (everything under `supabase/`,
  sign-in files, dependencies, deployment, agent configuration need the
  owner), a pull request template, bug and task issue forms. They take
  effect once branch protection is on (not yet: 16i).
- **Guides**: `CONTRIBUTING.md`, `docs/onboarding.md`,
  `docs/architecture.md`, `docs/starter-tasks.md`,
  `docs/local-demo-data.md`; README setup rewritten.
- **Local databases no longer call production.** The migrations write the
  hosted project's address into nine scheduled jobs, so a database built
  from them called the production sync functions (seen: one real
  `sync-federal-register` run from a laptop). `supabase/seed.sql` removes
  the jobs on local databases; it does nothing where the Vault secret
  `service_role_key` exists. Verified: `cron.job` is empty after
  `supabase db reset`.
- **Unit tests no longer need `.env.local`** (`vitest.config.ts` sets fake
  Supabase settings). Before, one suite failed without the file and loaded
  the real project's address with it.
- **Demo firm for local databases**: `scripts/export-demo-firm.sh` copies
  one firm's profile, shown matches, their documents and analyses into
  `supabase/seeds/demo-firm.sql`, with a local-only sign-in
  (`demo@regway.local`). No accounts, chat or usage records are copied.
  Verified local to local with an invented firm (export, reset, sign in,
  rows visible through the access rules). **Not run against the hosted
  project**: that is the owner's step.
- **Verified locally**: all 35 migrations apply to an empty database; a
  local sign-up; a local `sync-federal-register` run (78 documents). **Not
  verified**: sign-up and onboarding in the browser against a local database.

### 16h, first part: 43 more Federal Register agencies (2026-10-08)
`sync-federal-register` reads the federal bodies named in the registry
document's sections 1–36 that it was not reading, 64 agencies in the main
query in all, plus filtered feeds for the FAA, the Coast Guard and NOAA.
The list, the volumes and what was left out and why are in the function's
comments and in item 16h. Tried on live data before deploying: the widened
query returned 63 rules for the last seven days. Two unit tests added (424
in all). Deployed; the documents already in the last seven days come in on
the first run after the deploy.

### 16e: after the redesign (2026-10-08)
Asked for by the owner in one sitting after seeing the redesign; all live.
- **Colours**: flat black, white, grey and one blue in both themes. The
  gradients, blurred glows, frosted glass and tinted shadows are gone;
  "Enforcement" and "Geopolitical" labels are grey. `DESIGN.md` has the
  new table.
- **Dashboard**: the Settings button gave way to a light/dark switch
  (follows the device until used); greeting, level bar and AI bar sit
  centred in the window when no level is open; name, initials and counts
  are loaded before the dashboard shows; fund holdings are cached.
- **Chat**: answers set on the page without a bubble, with tables, code
  blocks (with Copy), nested lists and named links; a floating input; the
  header see-through in full screen; suggestions that fill one line; the
  disclaimer only before the first message; a space no longer goes missing
  after a search pause; past conversations cached, searchable and grouped
  by day; an answer still being written when the chat is closed finishes
  out of sight, and reopening returns to it. The model is told its answer
  is rendered Markdown (`regway-ai-chat`, deployed).
- **Account settings** lost the grey explanatory lines; profile cards lost
  the "each answer shows where it came from" line.
- **Domain**: https://www.regwayai.com (item 11b). Search engines may list
  it: `noindex` and the `robots.txt` block were removed, a canonical
  address, a descriptive title and link-preview tags (`public/og.jpg`)
  were added.
- **Public pages**: About, Sources, Legal disclaimers, Privacy
  (`InfoPage.tsx`), linked from the footer on every page.
- **An address per screen** (`src/lib/router.ts`, History API, no
  library): `/sign-in`, `/sign-up`, `/about` `/sources` `/legal`
  `/privacy`, `/profile/:tab`, `/funds/:id`, `/companies/:id`,
  `/developments/:id`. Reload, bookmarks, new tabs and the browser's Back
  and Forward work; a signed-in address asked for while signed out leads
  there after sign-in. `vercel.json` sends every path to the app.
- Tests: 422 unit, 138 browser (`tests/e2e/routes.spec.ts` is new).

### 16d: redesign, same colours (2026-10-08, branch `redesign`)
Notes: `prompts/redesign.md`; rules: `DESIGN.md`.
- **Type**: Geist and Geist Mono, bundled; larger reading text; nothing
  under 12px; small-caps labels became sentence-case headings.
- **Landing**: copy on the left and a real picture of a company page on the
  right (one per theme, regenerated by `CAPTURE=landing`); the sign-in form
  takes the picture's place. Sections each have their own layout; sources
  are grouped by region.
- **App**: one header and footer on every page; the three big dashboard
  buttons became one bar; feed cards set "Why it's here" apart; the
  development page has one action row and one side card; loading shapes
  and composed empty states.
- **Controls**: one set of button, tab, field, label and icon styles
  (`src/index.css`, `src/components/icons.ts`).
- **Accessibility**: skip link, visible keyboard focus, labels tied to
  fields, names on icon buttons, pressed/expanded states, reduced motion,
  text contrast, phone layouts.
- **Removed**: the "History" control and "Export Memo" (neither did
  anything) and the footer links to pages that don't exist.
- **Fixed on the way**: a page now opens at its top and Back returns to the
  place in the list; the development page names its source in words and
  formats dates.
- Checks: type-checks, 416 unit tests, 116 browser tests (10 new).

### 16b: wait before AI work, official document as the card, dark mode (2026-10-08)
Notes: `prompts/16b-decided-tasks.md`.
- **Five-minute wait**: a profile save records what it calls for in
  `profile_changes` (migration 0035); `apply-profile-changes` (every
  minute) does it once per firm, five minutes after the last change.
  Company re-scans wait the same way. Live: test rows waited, then ran as
  "1 firms, 2 calls".
- **Official document as the card**: a Federal Register document replaces
  the SEC / FTC / CFPB announcement of it once matched, with the
  announcement as its link and its own analysis from the official text.
  Live on H.I.G.: two such cards.
- **Dark mode**: all colours are theme variables; follows the device, with
  Match device / Light / Dark in Profile → Account.
- Tests: 416 unit, 106 browser.

### Fact provenance and "last confirmed" dates (2026-10-08)
Roadmap item 16. Notes: `prompts/fact-provenance.md`.
- **Storage**: `profile_meta` beside `profile` on firms, funds and
  companies (migration 0034): per answer, `source` (user or a named
  document) and `confirmed_at`. `profile` and everything that reads it are
  unchanged.
- **Stamping** in `toRow`: an entered or changed answer is dated now; a
  save does not date answers the user didn't touch.
- **Profile forms**: origin and date under each answer, "Still correct",
  "Add document", "Confirm all answers are current", an "Unknown" badge on
  blank optional facts, a count of answers over a year old.
- **AI**: analyses and chat are told which decisive facts are not recorded
  and which were last confirmed over a year ago.
- **Live**: the regenerated ITAR analysis for A.L.A. now says its supplier
  locations are not recorded and what that leaves unassessed.
- Tests: 396 unit, 96 browser.

### Duplicate-coverage grouping (2026-10-07)
Roadmap item 15. Notes: `prompts/duplicate-grouping.md`.
- **Model**: `regulations.duplicate_of` points a later version of a
  development at the first (migration 0033); nothing is merged or deleted.
- **Rules** (`_shared/duplicates.ts`, run by `group-duplicates` at :08 /
  :38): EU sanctions Decision + Regulation; one publication listed twice
  by a feed; a company scan's result that is a Federal Register document;
  and, by one small Haiku call per new document, an SEC / FTC / CFPB
  announcement and the Federal Register documents published for it.
- **Lists**: one card per development with the other versions as links,
  on the firm, fund and company pages and on the development's page.
  Dismiss and restore cover every version. RegWay AI's context names a
  development once. An analysis is not prepared ahead for a later version
  the firm already sees under its first version.
- **Live**: 28 links, all read and correct: 5 EU pairs, 1 FCA bulletin,
  14 scan results, and 8 documents under 5 SEC / FTC announcements. The
  announcement rule first missed one of two documents in a package, so it
  now reads the press release's page rather than the feed's summary.
- Tests: 383 unit, 90 browser.

### Defense trade controls (ITAR) from the Federal Register (2026-10-07)
Roadmap item 14, part 1. `sync-federal-register` gained a
`defenseTradeControls` feed (State Department RULE / PRORULE naming the
ITAR or the U.S. Munitions List), stored as geopolitical with the countries
each names. First sync: 2 documents. Tests: 337 unit.
Live on H.I.G. (scheduled run, 22:40 UTC): the U.S. Munitions List review
was matched to A.L.A. S.p.A. (aerospace and defense logistics) with its
analysis written ($0.11 in all); the Syria revision and the 14 UK / EU
sanctions items never reached the model, since H.I.G. touches none of
their countries.

### Geopolitical Phase 2: UK and EU sanctions (2026-10-07)
Roadmap item 13. Notes: `prompts/geopolitical-phase-2-sanctions.md`.
- **Sources**: the EU Council's restrictive measures (EUR-Lex), UK
  sanctions regulations (legislation.gov.uk) and OFSI general licences,
  notices and regime guidance (gov.uk). Three more entries in the feed
  registry, polled by `sync-regulator-feeds` every 30 minutes; migration
  0032 allows the sources.
- **Tagging**: each entry carries the countries it names, never the
  publisher's own; an entry naming none is not stored.
- **Pre-filter**: `match-geopolitical-relevance` skips UK / EU sanctions
  for a firm not connected to that region, before its country filter.
- **Judge**: a UK / EU measure needs a recorded connection to the affected
  country and a recorded presence in the UK / EU, on the same entity.
- **Live**: 14 items stored on the first sync (Russia, Ukraine, DR Congo,
  Burundi, Afghanistan, Iran). None names a country H.I.G. touches, so
  none reached the model ($0).
- Tests: 336 unit, 84 browser.

### Live monitoring, Phase 2: regulator feeds (2026-10-07)
Roadmap item 12. Notes: `prompts/live-monitoring-phase-2.md`.
- **Feeds** (`_shared/regulatorFeeds.ts`): SEC press releases, FTC, CFPB,
  FCA publications, PRA publications, UK statutory instruments, ESMA, and
  EUR-Lex (Parliament and Council acts; Commission delegated acts). Each
  was fetched and read first; each has a rule for which entries to keep
  (rulemaking, not enforcement, speeches or events). Not used: SEC's stale
  proposed-rules feed, the FCA news feed, EBA digests, CFTC (blocked).
- **`sync-regulator-feeds`**: every 30 minutes at :05 / :35, no AI. Stores
  entries from the last 30 days once each. One feed failing doesn't stop
  the others; the run only counts as failed after a feed fails three runs
  in a row.
- **Pre-filter**: `match-relevance` reads UK and EU feeds only for a firm
  connected to those regions (`regionsOf`), so a U.S.-only firm is never
  billed for them. The judge is told where a non-U.S. item applies.
- **Schedules** (migration 0031): SEC and FINRA enforcement hourly, SEC
  administrative proceedings every 3 hours, travel advisories every 6
  (all were daily).
- **Live on H.I.G.** (connected to the U.S., UK and EU): 24 feed items
  judged for $0.02; 2 relevant, both SEC proposals announced before their
  Federal Register publication; all 16 UK / EU items rejected with a
  specific reason.
- Tests: 322 unit (feed parsing, each feed's rule on real titles, regions,
  the sync function), 84 browser.

### Re-discovery after profile edits (2026-10-05)
Roadmap item 11. Notes: `prompts/rediscovery-after-edits.md`.
- **Gap:** the regulatory and enforcement matchers never looked again at
  an item once they had rejected it, so editing the firm (strategy,
  adviser registration, jurisdictions…), a fund, or what a company does,
  or adding a fund, never brought in matches the new facts justify. Only
  company location edits (geopolitical) and company HQ / sector / region
  edits (re-scan) were handled.
- **Now:** a save that changes a fact the matchers read
  (`lib/matchingFacts.ts`, the stored row normalised through the
  questionnaire first so an older row doesn't read as changed) calls
  `match-relevance` and `match-enforcement-relevance` with
  `reevaluate: true`; a firm location change also re-checks geopolitical.
  Adding a fund always does. Edits to anything else (website, headcount…)
  cost nothing.
- **Bounded:** each matcher forgets only its own rejections on its
  candidate window (newest 200; `forgetRejections` in `_shared/relevance.ts`),
  never matches or dismissals, judges the first batch at once, and sets
  `scheduled_matching_firms.requested_at` (migration 0030) so run-matching
  clears the rest over the next runs (enrolled firms; others get the first
  batch).
- **Cost on H.I.G. today** (193 regulatory and 46 enforcement rejections in
  the windows; 123 geopolitical): ≈ $0.25 per matching-fact edit (Haiku
  regulatory ≈ $0.14, enforcement ≈ $0.12), ≈ $0.55 when the firm's
  location changes too, plus ≈ $0.10 per new match's analysis. Spread over
  about 5 scheduled runs (≈ 2.5 h).
- Tests: 6 unit (`matchingFacts.test.ts`), 2 per matcher (forgets only
  rejections in its window and requests a scheduled re-check; an ordinary
  run forgets nothing), run-matching watches `requested_at`; 2 browser
  (`rediscovery.spec.ts`: a strategy edit re-checks, a website edit
  doesn't).
- **Not run live yet:** it deletes and re-judges H.I.G.'s rejection markers
  (production data), so it waits for the owner's OK.

### Landing page: sign-in in place, scroll reveals (2026-10-05)
Roadmap item 10. Notes: `prompts/landing-page-motion.md`.
- **Sign-in / sign-up in place:** the form (`AuthPanel.tsx`, formerly the
  full-screen `AuthScreen`) slides out from behind the hero while the hero
  text narrows to the left (side by side from 1024 px; below the text on
  smaller screens, scrolled into view). × or Escape closes it; the email
  field is focused on open; the header's and the hero's buttons switch
  between sign-in and sign-up. The app's `auth` view is now the landing page
  with the form open (password-changed notice included).
- **Scroll reveals** (`Reveal.tsx`, IntersectionObserver, CSS only, no
  library): feature cards from left / below / right, the new "How it
  works" steps from alternating sides, the sources list, a closing call to
  action that opens sign-up at the top. Copy updated to what the product
  does now (30-minute Federal Register sync, enforcement, sanctions /
  export controls / trade, advisories, day-by-day pages).
- `prefers-reduced-motion`: no movement; everything is simply shown.
- Phone: header keeps one line (its Get Started hides; the hero's is right
  below); no horizontal scroll.
- Tests: 6 browser tests (`landing.spec.ts`): form beside the hero and
  focused, switching and closing, phone layout, reveal on scroll, reduced
  motion, closing call to action. Existing sign-in and password tests
  unchanged and passing (76 browser tests).

### Fund and company pages; day-by-day lists (2026-10-05)
Roadmap item 9, plus the owner's request the same day: "whenever we click on
something, it should be showing stuff that AI found today", with a control
to go back a day at a time to the first day the user used the app. Notes:
`prompts/entity-pages-days.md`.
- **Day by day** (`lib/feedDays.ts`, `EntityFeed`): every list (PE Firm on
  the dashboard, each fund and company page) opens on what RegWay found
  today, meaning matched today (`regulation_relevance.created_at`) in the
  viewer's time zone, not the publication date. "‹ Today · October 5,
  2026 ›" steps back to the firm's sign-up day (`firms.created_at`, or an
  earlier finding); an empty day says so and links to the most recent day
  with findings; "All days" shows everything (search across days). The day
  is kept while a development is open and resets to today when the page is
  opened again. The publish-date filter now reads "Any publish date" /
  "Published past 30 days" so it isn't confused with the day.
- **Fund and company pages** (`EntityPage.tsx`, view `entity` in
  `App.tsx`): clicking a fund or company card opens its own page: name,
  type, structure / sectors and HQ, "Holds: …" / "Held by: …" from
  `fund_holdings`, "Edit profile", the day-by-day list, and the RegWay AI
  bar scoped to it. Company pages start or join a scan when one is due.
  Back from a development or from Edit profile returns to the page. PE
  Firm stays on the dashboard.
- AI input bar extracted to `AiAskBar.tsx` (read-only: it opens the
  drawer; typed text used to be silently dropped).
- Caveat: a re-check that moves a match to a different entity re-creates
  its row, so it counts as found on the re-check day.
- Tests: 6 unit (`feedDays.test.ts`), browser tests for the pages, the
  stepper, empty days, the first-day limit, keeping / resetting the day,
  and back-navigation (70 browser tests in all).

### Copilot: focus switching and chat sidebar (2026-10-05)
Roadmap items 7 and 8. Notes: `prompts/chat-scope-sidebar.md`.
- **Session context** (right panel, `SessionContext.tsx`): the firm, each
  fund and each company are selectable; the selection is what RegWay AI is
  focused on. Before the first message it sets the scope the chat starts
  with; after it, the next message carries `refocus` and the drawer says
  "Focus switched to …". Closable, reopened from the header. Lists the
  files attached in this chat (they're read with their message, not
  stored).
- **`regway-ai-chat` `refocus`**: looks the fund / company up through the
  user's own client (so only their firm's, and the stored name), saves it
  as the conversation's scope (firm-wide clears it), narrows the matched
  developments to it, and prefixes that turn with a one-line note so the
  model sets earlier turns aside. Unknown id: 404 before any AI call.
- **Chats sidebar** (left, `ConversationHistory.tsx`): replaces the History
  button and holds "New chat"; refreshes after each exchange so a new
  conversation appears once answered. Overlays the chat on narrow screens.
- AI message avatar "H" (from the Harvey name) now "R".
- Tests: 3 unit (refocus saved / firm-wide / refused), 4 browser (new chat
  listed, focus before first message, mid-chat switch sent once, panel
  close/reopen and files). Not run live with AI: needs the H.I.G. user
  signed in (see "Live AI tests still owed").

### Chat messages saved in order (2026-10-05)
A question and its answer were saved in one insert, so both got the same
`created_at` and a resumed chat (and the history sent to the model) could
put the answer first: half of H.I.G.'s saved pairs read answer-first. Each
row now carries its own time (question when asked, answer when finished);
the 32 tied rows already saved were moved apart by 1 ms (answer after
question). Test added in `tests/unit/regwayAiChat.test.ts`.

### Roadmap items 2–5 (2026-10-04)
- **Item 2, AI input.** The input on the dashboard is sticky: under a long
  list it stays at the bottom of the window, and at the end of the page it
  rests above the footer. Page headers were meant to stay at the top while
  scrolling and never did (`.glass-nav` set `position: relative`, which
  overrode the `sticky` class on all four screens); they do now.
- **Item 4, passwords.**
  - *Reset link.* Reproduced in a browser test: the form appeared, then
    `init()` in `App.tsx` finished its firm lookup and switched to the
    dashboard. The recovery state now wins until a new password is saved.
  - *After a reset* the user is signed out everywhere and lands on sign-in
    with "Password updated. Sign in with your new password."
  - *Changing the password from Profile* never happens on that screen
    (owner's call, 2026-10-04). "Update Password" asks for the current
    password, then emails Supabase's reset link; "Forgot password?" emails
    the same link without it, exactly as on the sign-in screen. The link
    opens the new-password page, and saving there signs the user out to
    sign in again. A typed-in-Settings change confirmed by a link was
    considered and not built: Supabase has no such flow, so it would need a
    table holding the pending (hashed) password, an edge function and a
    reworded email template.
  - *Requirements* (`src/lib/password.ts`): at least 8 characters, a
    lowercase and an uppercase letter, a number and a symbol, shown under
    the field and ticked off while typing, on sign-up and on the new-password page.
    Signing in to an existing account isn't held to them. The same rules
    were set in Supabase Auth by the owner.
- **Item 5, copilot context.** `regway-ai-chat`'s system prompt now carries
  every recorded answer for the firm, each fund and each company, and which
  fund holds which company, with the instruction that an unlisted fact is
  "not recorded", not "no". The formatter is shared with the impact
  analysis (`_shared/entityFacts.ts`). One entity's line is capped at 1,200
  characters.
- **Item 3, small fixes.** Chat messages are limited to 10,000 characters,
  text attachments to 150 KB and PDFs to 5 MB (was 15 MB), in the function
  and in the drawer. The rate limit is checked before a conversation is
  created, and a first message that gets no answer removes the conversation
  it started. `sync-federal-register?since=` refuses dates more than 400
  days back. The greeting follows the time of day; the chat avatar says "R".
- **Tests.** Handler tests now cover every edge function
  (`match-relevance`, `match-enforcement-relevance`, `company-regulations`,
  `rematch-regulation`, `refresh-entity-impacts` were the missing five).
  241 unit tests and 60 browser tests.

### Automated tests; four bugs found and fixed (2026-10-04)
Commit `69ce235`. Before this there was no test of any kind.
- **Unit tests (Vitest, 169):** `pnpm test`. Pure logic in `src/lib` (feed
  filter, "New" badge, markdown renderer) and in the edge functions'
  shared modules (countries, sanctions programs, footprints, holdings
  roll-up, relevance rows, usage), plus handler-level tests of
  `sync-federal-register`, `sync-travel-advisories`, `run-matching`,
  `regulation-impact` and `regway-ai-chat` against a fake database client
  and a stubbed `fetch` (`tests/unit/helpers`).
- **Browser tests (Playwright, 39):** `pnpm test:e2e`. The real app against
  a mock Supabase (`tests/e2e/mockBackend.ts`): sign-in, firm / fund /
  company pages, filters, dismiss, the detail page and re-check, fund
  holdings, chat and saved conversations. The dev server is started with a
  fake Supabase URL, so no run can reach the real project or spend AI
  credit; an unexpected edge-function call fails the test.
- `pnpm typecheck:functions` type-checks the edge functions with the `deno`
  npm package, so no separate Deno install is needed.
- **Fixed:** a quote in a URL in a chat reply ended the link's `href`, so a
  link could carry its own event handler (confirmed in the browser, then
  closed by escaping quotes in `markdown.ts`); dismissing an item after
  opening a fund page saved the dismissal but left the item on screen
  (`dismissRegulation` treated the per-fund cache as one list); the
  location filter listed "United States" and "United States (Federal)"
  beside "United States (federal)"; fund reasons read "a indirect
  connection".
- **Checked in production, read-only:** all 14 functions deployed, all six
  cron jobs succeeding, H.I.G.'s matching backlog cleared (last run with
  work 21:40 UTC, clean skips since), no duplicate relevance rows, and every
  Federal Register match for H.I.G. has its analysis.
- **Not covered, and what was left alone:** see Priority order item 3.

**Credit estimate for one firm in daily use** (H.I.G.-sized: 2 funds, 3
companies; from four days of `usage_events`, Sonnet 4.5 list prices, so a
rough range): scheduled matching ≈ $1 a month; analyses for new matches
$1–2; weekly company scans $3–10; chat $0.06 a message on average, so ≈ $12
a month at 10 messages a working day; everything else $2–5. About $10 a
month light, $25 typical, $60 heavy. Onboarding a new firm costs about
$5–6 once.

### Scheduled matching for H.I.G.; background analyses no longer cut off (2026-10-04)
Notes: `prompts/hig-scheduled-matching-investigate.md` and `-implement.md`.
- `scheduled_matching_firms` (migration 0029): `run-matching` covers only
  enrolled firms (H.I.G.); cron re-enabled.
- First run: 80 items evaluated, 8 relevant (6 GetixHealth Medicare payment
  rules, 2 private-fund-adviser enforcement cases), $0.15.
- **Bug found:** 4 of the 6 background analyses never appeared. Every
  analysis ran inside the matcher's own invocation, which the platform stops
  at ~150 s; at 30–70 s each, only the first few finished. Now
  `generateImpacts` hands each analysis to its own `regulation-impact`
  invocation (service key + firmId → 202, generated in the background).
  The 4 missing ones were written in parallel in ~60 s ($0.42).
- **Bug found:** Federal Register's `.txt` full text is an HTML `<pre>`
  page and was kept as-is because of the URL; text is now stripped
  whenever the body is HTML.

### Copilot conversations: save, resume, memory (2026-10-04)
Roadmap item 4. Notes: `prompts/chat-history-investigate.md` and
`-implement.md`. Found: the chat sent the model only the current message,
so follow-ups had no memory even inside one open drawer, and saved messages
were never read. Now each chat is a conversation (`regway_ai_conversations`,
personal, RLS); the function loads its recent turns from the database and
sends them (cached), keeps the conversation's original fund / company /
regulation scope, and refuses another user's conversation id before any AI
call. Drawer has "History" (recent 30, resume, delete) and "New chat".
Verified live ($0.011): "teal" remembered across turns, second turn served
from cache, cross-user access refused, resume renders in the browser.
Open: `regway_ai_messages` is still firm-wide under RLS; tighten to the
user when multi-user firms exist.

### Copilot grounded in matched developments (2026-10-04)
Roadmap item 3. Notes: `prompts/copilot-grounding-investigate.md` and
`-implement.md`. `regway-ai-chat` now puts the firm's live matches (scoped
to the fund / company / regulation it was opened from, read with the
user's RLS-scoped client) into its cached system prompt, each with the
entity's own reason, and answers "what's relevant" from them first. New
`_shared/matchedDevelopments.ts` is reusable by item 5's Context Analyst.
Found: company scans stored a placeholder instead of a reason for every
match (68 live rows); scans now return a real `why_it_applies`, older rows
update on rescan. Verified with one live message ($0.014).

### Pre-publication documents (public inspection) (2026-10-04)
Notes: `prompts/public-inspection-investigate.md` (with its correction) and
`-implement.md`. A separate public-inspection feed was built, run live and
removed: the Federal Register documents search already returns documents
scheduled for a future issue (106 dated ≥ 10-05 vs 107 on the list), and
every tracked rule on the list had been stored two days early. The real
problem was the label: those rows said "Published". Now
`regulations.on_public_inspection` is set from the scheduled date (Eastern)
and cleared by the 30-min re-sync; the app shows "Pre-publication" and
"Publishes <date>"; the analysis waits for publication only when the text
is genuinely unreadable (GovInfo often has the next issue a day early).

### Live monitoring, Phase 1a (2026-10-04)
Roadmap item 2. Notes: `prompts/live-monitoring-investigate.md` and
`-implement.md`.
- **The gap:** `match-relevance` and `match-enforcement-relevance` ran only
  from onboarding. H.I.G. had 1 of 93 Federal Register items evaluated
  since onboarding, Meridian 12 of 1,073: firm and fund pages were frozen.
- **`run-matching`** (new) runs every firm's three matchers every 30 min,
  10 min after the Federal Register sync (now every 30 min, was daily). It
  skips when nothing arrived and no backlog remains, takes one batch per
  matcher per run, records stats in `sync_runs` (an AI outage shows in the
  banner as "Automatic matching"), and accepts only the service key, which
  its cron job reads from Vault (`service_role_key`, set once; see
  `supabase/README.md`).
- The sync reuses countries already read from OFAC notices' full text
  (20 → 0 downloads on a repeat run), so 30-min polling stays cheap.
- Realtime on `regulation_relevance` (RLS holds: verified a firm never
  receives another firm's rows); the open dashboard list refreshes on a
  match. "New" badges for items matched since the previous visit (per user
  and firm, per device).

Verified live except the matching results themselves: the first real run
reached all 15 matcher calls and every one was refused by Anthropic (out of
credit). When credit is restored the next run starts clearing the backlog
(≈ $1–2 once across the 5 firms).

### Entity-page category filter and search (2026-10-04)
Spec §5. Notes: `prompts/entity-feed-filter-investigate.md` and
`-implement.md`.
- Firm, fund and company lists are one `EntityFeed` component: category
  chips (All / Regulatory / Enforcement / Geopolitical, with counts under
  the other filters), topic search over title, description, issuer and
  reason, a date window, and a location select built from the list being
  viewed (geopolitical items by country; everything else by issuing
  jurisdiction, U.S. federal collapsed into one option).
- Each item now shows the spec's missing pieces: a short description and
  "Why it's here", the selected entity's own reason (fund rows derived from
  holdings read "Indirect: Fund holds X, which …"). The data layer used to
  fetch that reason and drop it. Dates are labelled "Published".
- Pure logic in `src/lib/feedFilter.ts`, checked against H.I.G.'s real
  matches; UI checked in a browser with a throwaway firm (deleted).

### Re-check ("This match looks wrong?") for geopolitical items (2026-10-04)
Notes: `prompts/geopolitical-rematch-investigate.md` and `-implement.md`.
- The geopolitical verdict step moved into `_shared/geopoliticalJudge.ts`,
  shared by the matcher and `rematch-regulation`, so a disputed item is
  re-judged by exactly the rules that matched it, plus the user's note.
- **Bug fixed (both categories):** a re-check kept only the model's first
  verdict and upserted it, never replacing the firm's other rows on that
  regulation. A wrong company match therefore stayed live beside the new
  firm-level "not relevant". New `replaceRegulationVerdicts` replaces the
  set (dismissals and holdings-derived fund rows untouched); fund rows are
  re-derived afterwards. Latent in production (no contradictory rows
  existed; both real re-checks had been firm-level).
- **Bug fixed:** `resolveFirmContext` consumed the request body on the
  service-role path, so `rematch-regulation` and `refresh-entity-impacts`
  lost their own fields when called with the service key.
- The drawer now appears on geopolitical items and lists per-entity
  verdicts when a re-check names more than one entity. Enforcement is still
  refused.

Verified: the write path (replace, dismissal kept, fund row removed and
re-derived) against the live DB with a throwaway firm, deleted afterwards.
**Not verified live:** the AI step itself, because the Anthropic account
ran out of credit during this pass (see Context). Re-run steps are in the
implement notes.

### Fund → company holdings (2026-10-04)
Spec §3/§9/§13's indirect path ("the fund holds Lumen, which has a supplier
in Region C"). Notes: `prompts/fund-holdings-investigate.md` and
`-implement.md`.
- **`fund_holdings`** (migrations 0024/0025): many to many, user-entered
  only. Composite FKs to `funds (id, firm_id)` and
  `portfolio_companies (id, firm_id)` make a cross-firm holding impossible
  whatever a client sends; RLS = the firm's members.
- **UI**: each company card has a "Which of your funds hold this company?"
  chip picker that saves per toggle (outside the questionnaire, like the
  logo); each fund card lists what it holds. Empty reads "Not recorded",
  and nothing is claimed while holdings are still loading.
- **Fund matches are derived, not asked** (`_shared/holdings.ts`): a fund's
  geopolitical exposure is exactly "a company it holds has a supported
  connection", so every `match-geopolitical-relevance` call recomputes
  fund rows from the company verdicts plus holdings (no AI call, no way for
  the model to invent ownership). Marked `via_holdings`, so they're
  added, rewritten and removed as holdings or company verdicts change;
  direct fund verdicts and dismissals are never touched. Sibling companies
  in the same fund get nothing (§13). Changed fund rows force-regenerate
  that analysis so the fund's card appears or goes; fund lines in the
  analysis prompt name what the fund holds, so it writes the path.
- The helper takes a category, so regulatory/enforcement could opt in later
  (today their matchers ask Claude for fund verdicts from the fund's own
  profile instead).

Verified live with a throwaway firm (deleted afterwards, along with its
login; its 23 `usage_events` rows are kept as spend records). The firm had
a fund holding an Italian aerospace-logistics company and a U.S.-only
software sibling. The matcher evaluated 99 candidates in 3 calls; the
aero company matched 2 items, each produced exactly one fund row, and the
sibling got none. The fund's analysis card wrote "Fund holds … which is
headquartered in Naples" and noted on its own that the sibling has no
connection. Rewording, holding removal (both fund rows deleted, analysis
regenerated) and a repeat no-op run all behaved. Composite FK rejected a
cross-firm holding; RLS hid the test firm's holdings from H.I.G.'s user and
refused an insert into them. In the browser as the test user: the picker
showed "Not recorded" and then the selected chip, the click persisted the
holding and re-derived the fund rows, the fund card listed both companies,
and the dashboard's Fund Structure tab showed the derived geopolitical
items under the fund. H.I.G.'s own holdings were not entered (unknown;
§3), so its fund pages stay unchanged until someone records them.

### Geopolitical Phase 1 recheck (2026-10-04, later)
Rechecked with full network access. Notes:
`prompts/geopolitical-phase1-recheck-investigate.md` and `-implement.md`.
- **Federal Register CAPTCHA (was item 1.2).** Every federalregister.gov
  document URL (`.txt`, `.xml`, HTML) can 302 to `unblock.federalregister.gov`
  for automated clients. `_shared/text.ts` now treats a response that
  ended on that host as a failed fetch (no retry), and the new
  `_shared/federalRegister.ts` gives the sync and `impact.ts` one ordered
  list of text URLs: FR `.txt`, then GovInfo's official copy
  (`govinfo.gov/content/pkg/FR-<date>/html/<doc>.htm`, which also carries
  same-day documents and corrections), then the HTML page. Verified on four
  real documents from a blocked client.
- **The 45 (now 46) country-less SDN notices weren't CAPTCHA casualties.**
  Re-read from GovInfo: 35 publish the designee list as an image, 11 name
  no country, 0 name one. The country is in the authority line instead
  (`E.O. 13902` = Iran), so new `_shared/sanctionsPrograms.ts` maps
  single-country program orders to their country (program-wide ones like
  13224/13382 stay global on purpose). After the backfill: 46 → 32
  country-less, 14 now Iran (one also Mali). That moves them from
  "global, ask the AI for every firm with foreign exposure" to the free
  country pre-filter.
- **Impact analyses from a CAPTCHA page:** of 3 Federal Register analyses,
  2 read the real text. The third (`C1-2026-18574`, Cartesian) was written
  blind, but its relevance row is now not-relevant, so it's an orphan no
  screen shows; left in place rather than regenerated against no match.
- **Travel advisories RSS, live:** 216 items, every title and date parses.
  Fixed: summaries lost their opening words (`rss.ts` read
  `<![CDATA[Do not travel<p>` as one tag; CDATA is now unwrapped first,
  verified byte-identical on the SEC/FINRA feeds); summaries were often
  just the re-issue note (now skipped); and the site serves each country
  under two URL schemes from run to run, so rows keyed on the URL path
  duplicated 7 countries. Rows are now keyed by countries + level; the 60
  old rows were deleted (approved, nothing referenced them) and re-synced
  as 53.
- **Presidential documents, last 9 months:** 213 total, 59 kept. The kept
  set was right, but the filter missed real actions on word form
  ("Importation", "Duty-Free", "Trading With the Enemy Act", "Customs",
  "de minimis"). Widened; adds exactly those 8, no ceremonial documents.
- **Matcher:** the first run over the new items matched the global de
  minimis suspension to 3Pillar and A.L.A. on "could affect … if it
  imports". One rule added (foreign facilities alone aren't import
  activity); re-run rejects all four new items. Test verdicts and the one
  impact they spawned were removed.
- **Deploys:** all 13 functions redeployed with the CLI; production now
  matches the repo.

Found, not fixed: `finraNotices` hits the 20-page cap on a 9-month
backfill (daily runs are far below it); Federal Register republications
(`R1-…`) are stored next to the original (item 8); inside functions,
`SUPABASE_SERVICE_ROLE_KEY` is now the `sb_secret_…` key, so a manual
service-role call to a matcher must use that key, not the legacy JWT.

### Geopolitical monitoring, Phase 1 (2026-10-04)
Spec §8. Audit first (`prompts/geopolitical-monitoring-investigate.md`):
OFAC and BIS documents were already being synced but labelled
`regulatory`, and none had ever been evaluated for any firm (crowded out of
`match-relevance`'s newest-200 window by EPA/HHS volume). Built:
- **Sources, all official.** `sync-federal-register` now runs a declarative
  `FEEDS` list (adding a source is one entry): the existing rules, OFAC
  NOTICE (SDN designations), USTR trade actions (title-filtered), and
  presidential documents filtered to sanctions/tariff topics. OFAC, BIS
  and USTR documents are categorized `geopolitical`. New
  `sync-travel-advisories` ingests State Department level 3-4 advisories
  (one row per country page and level, so a level change is a new
  development), scheduled daily at 12:00 UTC (migration 0023).
- **`regulations.countries`** (GIN-indexed), filled by a deterministic
  gazetteer (`_shared/countries.ts`: 200 countries plus demonyms, so
  "Iranian Transactions…" → Iran; longest-alias-first so "Papua New
  Guinea" doesn't also count as Guinea). For SDN notices, whose abstracts are
  boilerplate, countries come from the full text.
- **`match-geopolitical-relevance`**: pre-filter, then AI. Each entity's
  footprint (`_shared/footprint.ts`: HQ, facilities, operations, suppliers,
  each kept as its own connection kind, plus what the company does) gives
  the countries it touches. Only developments naming one of those, or
  global measures when there's foreign exposure, reach the model, along
  with the exact overlapping profile facts already computed. The prompt
  forbids "is sanctioned/prohibited" language and keeps similar names as
  unconfirmed identities. It says direct vs. indirect, and treats a
  designee's address as not a connection. It runs on dashboard load (a
  no-op with no AI call when nothing is new), at onboarding, and with
  `reevaluate` after a company location edit or a new company.
- **Impact analysis** prompts moved into `_shared/impactPrompts.ts`, one
  spec per category (regulatory and enforcement text moved verbatim,
  checked mechanically), plus a geopolitical one.
- **Frontend**: the country list is every country (it was 19, with no
  China, Russia, Vietnam…, so supplier locations couldn't name them); the
  tag input got type-to-filter search; travel-advisory source label.

Real bugs found and fixed along the way:
- Federal Register's HTML page returns a CAPTCHA to automated requests. 2 of
  the 3 existing Federal Register impact analyses had been written from the
  CAPTCHA page, not the rule. The sync now stores each document's `.txt`
  URL as `raw.raw_text_url`, which `impact.ts` already preferred.
- Detail page header labelled the publication date "Effective" whenever an
  item had no effective date.
- `upsertRelevanceRows` failed outright if a model returned two verdicts for
  the same row. It now dedupes, preferring a relevant verdict; this affects
  every matcher.
- Federal Register mislabelled USTR documents with their parent office;
  every feed's agencies now count as tracked in `primaryAgency`.

Verified live on project `cfspwaqtidfliupmlfwz`: backfill since 2025-12-20
synced 1,337 Federal Register documents, 252 of them geopolitical (157 OFAC,
59 presidential, 24 USTR, 12 BIS), plus 53 level 3-4 travel advisories.
For H.I.G. Capital, 121 of 305 geopolitical items passed the free
pre-filter. All 121 were evaluated in 4 batches (about $0.06 each); 2
matched. The first rule set produced speculative matches (SDN designees
"located in Italy" → A.L.A.; an aluminum tariff → A.L.A. "if it exports
these materials"), fixed by the designee rule and by giving the model each
company's activity. The final pass rejected every SDN notice and the
aluminum, semiconductor and ICT items with sector-aware reasons. It kept the
Section 232 aircraft-parts proclamation → A.L.A. (aerospace logistics,
Italy), whose regenerated analysis now reads the real proclamation ("does
not impose tariffs at this time", 180-day negotiation window). Browser check
as the test user: the item renders with the Geopolitical badge on A.L.A.'s
page and opens to the analysis; country search filters 200 options.

Deployed to production in this pass: `sync-federal-register`,
`sync-travel-advisories`, `match-geopolitical-relevance`, `match-relevance`
(now regulatory-only), `regulation-impact`, `refresh-entity-impacts`.
**Not redeployed at the time** (redeployed in the recheck above): `match-enforcement-relevance`,
`rematch-regulation`, `company-regulations`, `sync-sec-enforcement`,
`sync-finra-enforcement`, `sync-sec-admin-proceedings`. Redeploy them with the
CLI to pick up the shared `upsertRelevanceRows` dedupe and RSS entity
decoding.

### Product-realignment doc baseline (verified in code, no work needed)
From `docs/Regway_AI_Features_and_User_Journey.docx` — gap-checked against
the actual code, not just the doc's wishlist:
- Three-entity dashboard (PE Firm / Fund Structure / Portfolio Companies) —
  `Dashboard.tsx`, with per-fund and per-company drill-down (see "Per-fund
  drill-down" below) and a portfolio company selector (logos: see
  "Cross-links, profile last-updated, portfolio company logos" below).
- Per-entity relevance with an explanation —
  `regulation_relevance.relevance_reason` + detailed Impact Cards
  (`ImpactPanel.tsx`, one card per firm/fund/company with how-it-applies,
  obligations, timeline, open questions). Distinguishing direct vs.
  indirect exposure and stating uncertainty (open_questions) is in
  `_shared/impact.ts`'s prompt.
- Detail page with summary, sources, per-entity relevance —
  `HeadlineDetailView.tsx` + `ImpactPanel.tsx`. Proposed vs. final status is
  a field in the impact analysis (`status`) and now also surfaced on list
  items (see "Proposed-vs-final status badges" below). Missing-fact honesty
  ("no data risk-free" framing) — `EmptyState` copy avoids
  "compliant"/"risk-free" language.
- Flag for review, notes, dismiss/restore, and now a dispute/re-check loop
  — detail-page actions (see "Match correction loop" below).
- Firm/fund/company profiles with business activity, sectors, locations,
  adviser status, etc. — the questionnaire (`src/lib/questionnaire.ts`),
  including legal domicile and supplier locations (see "Location
  granularity" below). Per-fact provenance is the one piece still open —
  see Priority order item 7.
- A copilot that answers questions grounded in the firm's data with web
  search and cites sources, auto-scoped to whatever entity is open — RegWay
  AI (`RegWayAICopilot.tsx`, see "Copilot context scoping" below).

### Healthcare + trade/sanctions agency expansion (commit `f75b0ae`, 2026-10-02)
From the new `docs/Regway_US_Regulatory_Source_Master_Registry_Comprehensive_V2.docx`
(a 52-section federal/state/local/SRO source taxonomy) — read in full,
healthcare (§6–7) and trade/sanctions (§17) sections cross-checked against
the live Federal Register API before building. Added FDA, CMS, DEA, OFAC,
BIS, and CBP to `sync-federal-register`'s tracked agencies, each confirmed
via real 9-month RULE/PRORULE volume first (88/28/21/20/20/15 — same range
as existing tracked agencies like SEC 25, FDIC 12, FTC 10).
- FDA and CMS add no new volume — every sampled document from both is also
  tagged with the already-tracked HHS parent, so they were already being
  synced, just mislabeled as generic "Health and Human Services
  Department." DEA/OFAC/BIS/CBP are genuinely new coverage (each tags only
  with its own untracked parent department).
- Found and fixed a real bug this exposed: `primaryAgency()` picked the
  *first* tracked match in a document's agency list, which worked when
  only a specific bureau was tracked (OCC, FinCEN) but broke once a parent
  (HHS) and its own children (FDA, CMS) were both tracked — the parent is
  listed first by Federal Register and matched first, regressing to the
  generic label. Fixed to prefer a tracked entry with a `parent_id` (a
  sub-agency) over one without. Verified live: before the fix, 25 docs in a
  test window were mislabeled "Health and Human Services Department";
  after, only 2 genuinely HHS-only items remain, with 16 correctly labeled
  Food and Drug Administration and 7 Centers for Medicare & Medicaid
  Services.
- The source doc goes far beyond this — §17 (OFAC/BIS/DDTC/CFIUS) directly
  pre-scopes Priority order item 1 (geopolitical/sanctions monitoring) —
  and §37–47 (state/county/tribal/licensing-board level) is explicitly
  flagged by the doc itself as needing dynamic, not static, resolution.
  See Priority order items 1 and 13 for what's still open from it.

### Harvey → RegWay AI rename, finished (commit `c53a764`, 2026-10-02)
Migration 0009 (see "Harvey AI renamed RegWay AI" below) renamed the
user-facing brand but deliberately left the backend identifiers
(`harvey-chat` edge function, `harvey_messages` table) unchanged at the
time. This finishes it: edge function renamed to `regway-ai-chat` (old
deployed function removed after the new one was verified live), table
renamed to `regway_ai_messages` along with its index and RLS policy
(migration 0022 — historical migrations 0001/0003/0005 left untouched,
per normal migration-history practice), frontend call site and
`supabase/README.md` updated. Verified live end-to-end: sent a real
message through the dashboard AI bar, confirmed it streamed correctly and
persisted into `regway_ai_messages` with the correct `firm_id`.

### Match correction loop (commit `f187a83`, 2026-10-02)
Closes the doc's "flag an incorrect match or correct the profile fact
responsible, and have the explanation update" gap. Two new functions:
- `rematch-regulation`: the detail page's "This match looks wrong?" drawer
  re-runs the verdict for one regulation against the firm's *current*
  profile, optionally weighing a user-supplied correction note. Upserts the
  relevance row in place (can flip relevant ↔ not relevant) and
  force-regenerates the impact analysis when still relevant, so the
  explanation visibly updates rather than silently going stale. Regulatory
  category only for now — enforcement's matching prompt is deliberately
  different (allegation-vs-finding framing) and a shared re-match path
  would blur that; left for later. `ImpactPanel` gained a `refreshToken`
  prop to pull the regenerated content instead of the stale cached one.
- `refresh-entity-impacts` + `refreshEntityImpacts` (data.ts,
  fire-and-forget): after any firm/fund/company profile save,
  force-regenerates the impact analysis for whatever that entity is already
  matched to. Bounded to currently-matched items (never re-discovers new
  matches or re-runs the historical backlog — see Priority order item 10)
  so it's always cheap. Covers the real gap in `saveCompanyAnswers`
  specifically: it already deletes relevance rows and triggers a rescan
  when hq/sectors/regions change, but a fact that affects the impact
  analysis without triggering a rescan (e.g. regulated status, sensitive
  data) previously left the explanation stale with no mechanism to catch
  up.

`generateImpacts` gained an optional `opts.force` passthrough to
`generateImpact` for this; existing call sites are unaffected.

Verified live via real authenticated requests against the test account's
own firm (from the browser's own session token): `rematch-regulation`
correctly flipped a mismatched NYDFS cybersecurity rule to not-relevant
given a correction ("we don't operate in New York"), with reasoning that
engaged with both the firm's real jurisdictions (Pennsylvania, and the new
Delaware legal-domicile field) and the stated correction; a second real
call confirmed sound strict-relevance reasoning on an unrelated item;
`refresh-entity-impacts` returned the correct `queued: 0` for a firm with
no live matches. The relevant→force-regenerate branch reuses
`generateImpact`'s pre-existing, already-proven force path rather than new
logic. Per-field provenance (linking a match to the *exact* profile
question that drove it, not just "re-check against current profile") stays
out of scope — see Priority order item 7.

### Location granularity (commit `4e5de94`, 2026-10-02)
Doc wants legal domicile, office location, operating location, and
supplier location kept distinguishable. Office location and operating
location already existed (`offices`, `operating_locations`); added the two
real gaps:
- `firm.legal_domicile` (new, optional, location type): the state/country a
  management company or GP entity is formed in, when different from its HQ
  (e.g. a Delaware LLC headquartered in New York). Feeds
  `firms.jurisdictions` alongside HQ state, so it's picked up by
  `match-relevance` automatically — no edge-function prompt changes needed.
- `company.supplier_locations` (new, optional, multi-select): where key
  suppliers/manufacturers/vendors are based, kept separate from
  `operating_locations`/`regions` since it's a different exposure dimension
  — prerequisite data for geopolitical/sanctions monitoring (Priority order
  item 1), not used by today's regulatory/enforcement matching.

Also added `legal_domicile` to the detailed impact analysis's firm facts
whitelist in `_shared/impact.ts`, and taught that module's `facts()`
helper to format `{city,state,country}` profile objects as a readable
address instead of dumping JSON.

Verified live: saved via Profile → Firm, confirmed in the DB that
`jurisdictions` now includes "Delaware" alongside the existing HQ state;
`supplier_locations` field renders correctly in Profile → Portfolio
Companies with its distinguishing help text.

### Proposed-vs-final status badges on list items (commit `d8215a2`, 2026-10-02)
The impact analysis captured `status` but the dashboard's headline cards
didn't surface it — a user only saw it after opening an item. New
`StatusBadge` component parses just the lead word of the AI-written status
text (Final/Proposed/Interim/Notice) and renders nothing for messier text
rather than a misleading fragment; new `fetchImpactStatuses` batches a
status-only read per visible list. Verified the parser against real
production status strings pulled read-only from the DB (correct badge on a
clean "Final regulation, effective..." string; correctly no badge on two
ambiguous real ones, e.g. "Voluntary guidelines finalized..."). A
live-browser screenshot wasn't obtained — the only test account with real
matched regulations would have needed a temporary DB write to seed data,
which Claude Code's auto-mode write protection correctly blocked.

### Copilot context scoping (commit `55ce04d`, PR #3)
"Ask AI about this" entry points added on a fund, a portfolio company, and
a regulation's detail page, threading an `AiContext` through to
`harvey-chat` so its system prompt focuses on that one item instead of the
generic firm-wide context. When opened generically with more than one
fund/company, the model asks which one is meant instead of guessing. Also
fixed a real bug found while testing this: the reveal animation's cleanup
fired as soon as the network stream ended rather than once on-screen text
caught up to the full response, silently cutting off longer answers
mid-sentence in the UI (the full text was always correct server-side).

**Follow-up (commit `9730417`, 2026-10-02, user-requested mid-session):**
the dashboard's "Ask AI about this fund/company" buttons were replaced with
implicit scoping — the bottom AI bar's placeholder and the context it opens
with now follow whatever fund/company is currently open on the dashboard
automatically, no button click needed. Verified live: selecting NovaPay
changed the placeholder to "Ask RegWay AI about NovaPay..." and opening the
drawer showed "Focused on NovaPay" with no button click.

### Chat input polish (commits `dd0006b`, `ae37a43`, `cdea9b2`)
The AI copilot's input is now an auto-growing textarea (was single-line),
capped at a max height before scrolling internally, with the paperclip
button's vertical position fixed so it no longer clips at the bottom. Two
live-feedback fixes on top: the textarea's inherited 9999px pill radius
(fine at one line, wrong once it grew taller) scoped down to 18px for this
input; bottom padding tuned twice from an initial generous value down to
16px (vs. 14px top) after live review called the first pass too big, and
the textarea now scrolls to its own bottom on every change so the active
line keeps full padding below it once the height cap is hit.

### Per-fund drill-down (commit `f524193`, PR #2)
Fund Structure tab replaced its one aggregated cross-fund regulation list
with the same select-a-fund-first, then-see-its-own-regulations pattern
Portfolio Companies already used.

### RegWay AI overhaul (commit `eaac134`)
All four original asks (streaming, markdown, mic removal, file upload),
plus several real rounds of live-feedback fixes. **Confirmed working in the
browser:** streaming; the scroll fix (see below); the stop button (see
below). Remaining open items tracked under Priority order item 11.
- Mic button removed from `Dashboard.tsx`'s compact AI bar; the previously
  decorative "Attachment" button there now opens the AI drawer.
- `src/lib/markdown.ts` (new, no dependency): headings, bold/italic, inline
  code, fenced ``` code blocks, blockquotes, auto-linked URLs,
  bullet/numbered lists. Verified standalone with a script covering every
  feature plus an XSS attempt, confirmed always inert. Found and fixed a
  real bug this way: blockquotes (`>`) were silently broken because the
  whole message was HTML-escaped (`>` → `&gt;`) *before* block-type
  detection ran — fixed by detecting block structure on raw text first.
- File upload: `.txt`/`.md` inlined into the message, `.pdf` sent as a
  native Anthropic document block.
- **Scroll bug, two real root causes found and fixed.** First: nested
  `flex-1` containers without `min-h-0` silently blocked the scroll
  container from ever actually scrolling (classic flexbox trap — it grew
  instead of scrolling). Second, after that fix "still couldn't scroll
  while typing": the auto-scroll effect fired on every streamed token
  (~every 16ms) and re-forced the view to the bottom based on a `followRef`
  flag that only updated via the async `scroll` event — during a continuous
  scroll gesture the forced scroll could win the race before the flag ever
  flipped, pinning the view to the bottom. Fixed by switching to real
  user-intent detection (`onWheel`/`onTouchMove`, which only ever fire from
  genuine input, never from our own programmatic `scrollTop` assignment) —
  a manual scroll now disables auto-follow for the rest of that message,
  full stop, no threshold to fight. Confirmed working live.
- **Stop button, root cause found and fixed.** Was only calling
  `abortRef.current?.abort()` and waiting for that to propagate back
  through the stream — not reliable enough to depend on alone. Now the
  click handler kills both timers and flips the UI state directly and
  immediately, with a guard (`abortRef.current === controller`) so a stale
  cleanup can't clobber a newer message if the user stops one reply and
  immediately sends another. Confirmed working live.
- **"Stops without finishing" bug, root cause found and fixed.** Was
  `max_tokens: 1536` in `harvey-chat` — too small once multiple web
  searches and their results eat into the same token budget before the
  model finishes writing. Raised to 4096, and added a safety net: if the
  model ever does hit the limit again, the reply now shows an honest
  "*(Response cut off — reached the length limit)*" note instead of just
  silently stopping.
- UX-polish from live feedback across several rounds: single-word status
  labels next to the thinking indicator ("Diligencing", "Benchmarking",
  etc. — no trailing "…", the dots already carry that); the three dots have
  a slow, smooth wobble (not a sharp bounce); a thin dark trailing cursor
  while generating (was a thick blue block character) that also blinks
  through a mid-response tool-use pause so there's never dead silence;
  citations are deduplicated and width-capped so a growing citation list
  can't visually dominate; a floating "scroll to latest" button appears
  once scrolled away; the drawer expands to a full-page view once the
  first message is sent, with the suggestion chips disappearing to make
  room (still an unconfirmed judgment call — see Priority order item 11).

### AI API cost investigation (2026-10-01)
User reported a $10 Anthropic top-up down to $0.57 within a day and asked
why. Checked the real September cost CSV (not a guess): **$12.76 total for
the month, 58.5% of it ($7.46) on 2026-09-30 alone** — this session's heavy
real-data testing (enforcement monitoring, matching, PDF extraction, and
especially the AI-chat iteration above, each round requiring a real test
message). No bug or runaway loop found — Supabase's own function logs
confirm call counts were real, human-paced testing (~12 real `harvey-chat`
messages that day), not a loop. Cost breakdown by category corrected an
assumption from earlier in the session (that `web_search` was the main
driver — it is not):
- `input_no_cache`: 48.7% ($6.21) — **the real #1 cost**, and the name is
  the tell: **no function in this codebase uses Anthropic prompt caching**
  (`cache_control` breakpoints) anywhere, confirmed by grep. Every call
  re-sends and re-bills its full context from scratch, even the parts that
  are identical or near-identical call to call (a firm's system-prompt
  context in `harvey-chat`, a batch's entity list in
  `match-relevance`/`match-enforcement-relevance`, a regulation's text in
  `_shared/impact.ts`). Fixed — see "Prompt caching" below.
- `output`: 39.2% ($5.00) — will tick up further now that `harvey-chat`'s
  `max_tokens` was raised 1536 → 4096 for the bug fix above. See Priority
  order item 9 (right-size `max_tokens`).
- `web_search`: 12.1% ($1.55) — real, but the smallest of the three; not
  the lever worth pulling first.

**Prompt caching** (commit `7b2cc7b`) — `cache_control` breakpoints added
to the stable parts of each AI-calling function's prompt (`match-relevance`,
`match-enforcement-relevance`, `regulation-impact`,
`sync-sec-admin-proceedings`); `company-regulations` deliberately left
uncached since its content never repeats. Directly targeted the 48.7%
`input_no_cache` line above.

**Usage logging** (commit `7b2cc7b`) — new `usage_events` table +
`recordUsage()` helper wired into every AI-calling function (model,
input/output/cache tokens, search count, $ estimate, function name,
firm_id), so "why did this spike" is now a direct query instead of asking
the user to export a CSV and reading project logs by hand.

### Source-outage visibility (commit `9c8c18d`)
New `sync_runs` table (source, ran_at, ok, detail) written by all four sync
functions (`sync-federal-register`, `sync-sec-enforcement`,
`sync-finra-enforcement`, `sync-sec-admin-proceedings`) via a shared
`_shared/syncRun.ts` helper. `fetchFailingSources()` reads the latest run
per source; `Dashboard.tsx` shows a small banner naming any source whose
latest run failed, so a quiet dashboard reads as a stated limitation
instead of silently implying nothing is relevant. Verified live: real
successful runs recorded correctly, and a temporarily-inserted failing row
(removed after) confirmed the banner logic surfaces it correctly.

While building this, used the newly-connected Supabase MCP server's log
access to finally root-cause `sync-sec-admin-proceedings`'s hang (open
since the enforcement-monitoring work): the Claude PDF-extraction call was
the one fetch in that function with no timeout, so one stalled request
(SEC was rate-limiting from earlier testing) hung the whole invocation
forever with nothing in any log, since the platform only logs a request
once it finishes. Added a 45s `AbortSignal`; confirmed live that a stalled
request now times out, the run completes, and the outcome lands in
`sync_runs`.

### Enforcement monitoring (commit `612432d`, re-enabled `feffe29`)
Three new sources feed `regulations` with `category: 'enforcement'` (new
`category` column, migration 0012, default `'regulatory'` so nothing
existing changed). All three sources are now live.
- `sync-sec-enforcement`: SEC Litigation Releases (federal-court civil
  actions), free RSS + plain-HTML page, regex-extracted narrative. Verified
  live (25 real releases ingested correctly).
- `sync-finra-enforcement`: FINRA has no dedicated disciplinary-actions
  feed (checked and ruled out: a dead FeedBurner alias, a 404 guess, and an
  unrelated generic content feed) — instead filters FINRA's real
  newsreleases feed by title pattern (bars/fines/suspends/expels/etc.), the
  same "filter a broader real feed" approach already used for FINRA's
  Federal Register notice coverage. Verified live: correctly picked out all
  4 real enforcement releases from a 10-item feed and correctly excluded
  all 6 non-enforcement ones (board elections, research reports).
- `sync-sec-admin-proceedings` (SEC's in-house administrative-proceedings
  track): the core extraction (sending each PDF directly to Claude, since
  these link to PDFs with no cheap text-extraction path) was verified to
  produce accurate, clean summaries. Was left unscheduled after an
  unresolved hang (migration 0015); the hang was later root-caused and
  fixed (see "Source-outage visibility" above). **Re-scheduled 2026-10-02**
  (migration `0021`, commit `feffe29`), applied directly to the project via
  the Supabase MCP server and confirmed active in `cron.job`. A scheduled
  check will confirm the first unattended run landed cleanly in
  `sync_runs`.
- `match-enforcement-relevance`: separate matching function (not a shared
  prompt with `match-relevance`) requiring a genuine factual overlap in
  conduct/instrument/practice, never a shared-industry-label match, and
  explicitly forbidding language that implies the firm/fund/company did
  anything wrong. Shared auth/entity/rate-limit plumbing factored into
  `_shared/relevance.ts` so neither matcher duplicates it. Verified live
  against a real firm: 25 enforcement items evaluated, 1 correctly matched
  (adviser-employee fund misappropriation → the firm's own advised fund)
  with well-reasoned rejections for the other 24.
- `_shared/impact.ts`'s detailed-analysis prompt branches by `category`: an
  enforcement item gets its own framing (allegations vs. settled findings
  stated exactly as the source describes them, obligations forced empty,
  explicit "not a party to this action" language) instead of the
  rule-shaped prompt. Verified live: the one real match above produced an
  analysis that correctly never implied the firm did anything wrong and
  flagged real distinguishing facts.
- Dashboard/detail/dismissed-list category badges (`CategoryBadge.tsx`) so
  enforcement items are visually distinguishable from regular regulatory
  items (blue/orange/purple for regulatory/enforcement/geopolitical).

### Cross-links, profile last-updated, portfolio company logos (commit `7ddb79f`)
- Cross-links: `HeadlineDetailView.tsx` shows "Also relevant to" chips when
  a regulation matches more than one fund/company for the firm
  (`fetchRelatedEntityMatches` queries `regulation_relevance` directly —
  the same data `_shared/impact.ts` already used server-side, now also
  exposed to the frontend). Clicking a chip opens that entity's Impact
  Card. Verified live via a temporary synthetic second match (removed
  after confirming the query returned both entities correctly).
- `profile_updated_at` stamped on every firm/fund/company save (via
  `toRow()`, the one write funnel) and shown on each profile card.
  Deliberately scoped down from full per-fact provenance ({value, source,
  confirmed_at}) — see Priority order item 7.
- Portfolio company logo upload: public Supabase Storage bucket, upload
  control on the company's profile card, shown on the Dashboard company
  picker in place of initials once set. Found and fixed a real bug via the
  Supabase MCP server's log access: the storage write policies'
  unqualified `name` column silently resolved to
  `portfolio_companies.name` instead of the upload path (both tables have
  a `name` column), so uploads failed RLS for every caller regardless of
  auth — confirmed via project logs showing a real user's failed attempt,
  fixed by qualifying the reference (migration 0018).
- Also connected the Supabase MCP server (`.mcp.json`) and its reference
  skills (`.agents/`, `.claude/skills/`) — this is what gave access to real
  logs/advisors/SQL instead of the temporary-debug-function workarounds
  used earlier in the enforcement-monitoring work.

### Forgot password (commit `612432d`)
Sign-in screen has a "Forgot password?" link → `resetPasswordForEmail`; a
`PASSWORD_RECOVERY` auth event routes to a new `ResetPasswordScreen.tsx`.
Verified live: a real reset email was sent and received.

### Cancel button during onboarding (commit `612432d`)
Signs out and returns to the landing page, using the same `signOut()` call
as the existing Profile sign-out button.

### Detailed impact analysis, Impact Cards, dismiss/restore (commit `d6e8710`)
Detail view has a Summary | Impact Cards toggle. Summary = neutral,
professional breakdown (overview, scope, status, key provisions, key
dates, how it relates to each entity, points to confirm with counsel,
disclaimer). Cards = one expandable card per affected firm/fund/company
(how it applies, requirements, timeline, areas touched, what's not yet
known). Generated by `_shared/impact.ts` (Sonnet 4.5, up to ~60K chars of
regulation text, forced structured output, no severity ratings), stored in
`regulation_impacts` (migration 0011), generated in the background by
`match-relevance` / `company-regulations` for newly relevant items via
`EdgeRuntime.waitUntil` (max 8, 3 at a time) with `regulation-impact` as
the on-demand fallback (30/hour). Dismiss = `dismissed_at` on the firm's
relevance links (never resurfaces from matches/scans, survives company
rescans); hover X on dashboard items, "Not relevant — dismiss" in the
detail view, restore under Profile → Dismissed. Verified: real analysis
generated (~50s on demand), cards render, dismiss and restore round trip.

### Background pre-warm of company scans
`src/lib/scans.ts` scans every portfolio company that needs it (never
scanned, details changed, or >7 days old, tracked by new `last_scanned_at`,
migration 0010) in the background, two at a time, on dashboard load and
after adding/editing a company; stops on the 15/hour rate limit. Results go
straight into the cache, so opening a company is instant; cards show
"Researching…" while it runs. Verified: scan ran in ~32s in the
background, then the company opened instantly.

### Onboarding split + complete-later forms + reminders
PDF questionnaire (56 questions) turned into one registry
(`src/lib/questionnaire.ts`). Signup asks only what drives first-dashboard
relevance (your name; firm name/HQ/type/industries/geographies/adviser
registration; first fund name/domicile/structure; company
name/website/HQ/industry/one-liner). The rest lives in registry-driven
forms on Profile (Firm/Funds/Portfolio tabs, per-entity completion rings)
with a dashboard reminder card (progress ring, per-entity chips, deep
links, 24h snooze) and a dot on Settings. Answers land in new `profile`
jsonb columns (migration 0009) and derive the legacy columns;
`match-relevance` and `company-regulations` prompts now use them. Dropped:
firm fund/company counts (derived), brief recipients (single user).
Decision: fund industries/geographies are optional and inherit the firm's.

### Stale-while-revalidate cache
`src/lib/cache.ts`: names, greetings and lists render instantly across
screens; cleared on sign-out.

### Harvey AI renamed RegWay AI
In the UI, component and system prompt (edge function slug `harvey-chat`
and table `harvey_messages` unchanged).

### Landing page, Profile screen, logo rebrand (commit `60b291f`)
Signed-out users see a glass landing page (`LandingPage.tsx`) before auth;
the Dashboard avatar opens a tabbed Profile screen — Account (name, email,
password, sign out), Firm, Funds, Portfolio Companies — with editable
settings backed by new `data.ts` helpers, a shared `TagInput`/`options.ts`,
and RLS migrations `0006` (firms UPDATE) and `0007` (relevance DELETE).
Logo assets from `assets/` wired in via `LogoMark` and favicon. Show/hide
toggle on all password inputs (`PasswordInput`), verified on Profile.
Migration `0008` fixed the duplicate `regulation_relevance` rows
(NULL-distinct unique constraint → `NULLS NOT DISTINCT`); verified 9 → 7
rows, 0 duplicate groups.

### Day 1 polish pass (commit `ec471ee`)
Removed the duplicated AI summary and the already-obsolete fake deep-dive
placeholder text in `HeadlineDetailView.tsx`; removed "Recent Shifts" from
the History toggle; fixed the copyright year 2025 → 2026; rebranded
LexPulse → RegWay across the app, README, package.json, and the migration
header comment.

### Relevance-matching prompt fix (commit `ec471ee`)
`match-relevance`'s prompt now explicitly rejects speculative reasoning
("may have exposure") and purely administrative/procedural notices. Took
two tightening passes — the first only removed hedge words without fixing
the underlying speculative logic. Verified: `relevant: 0` out of 12
currently-synced items for both test firms, including the previously-wrong
CFTC whistleblower item now correctly excluded with sound reasoning.

### Federal Register sync scheduling (commit `62e5a4f`)
Enabled `pg_cron`/`pg_net` and scheduled `sync-federal-register-daily` at
11am UTC (7am Eastern, EDT — corrected after checking the actual operating
timezone directly rather than guessing). Flagged that this will drift to
8am Eastern once EST begins in November until manually adjusted to 12pm
UTC. Verified end-to-end via a manual `net.http_post` call matching what
the cron job runs.

### Pagination (commit `62e5a4f`)
`sync-federal-register` now loops through pages (20-page/2,000-document
safety cap) instead of silently dropping anything past the first 100
results. Verified with a real 379-document window — paged 4 times, all 379
rows landed correctly.

### Agency list expansion + mislabeling fix (commit `cc71ec9`)
Added Federal Reserve, OCC, FDIC, FinCEN, FTC, and NLRB (9 → 15 tracked
agencies), each confirmed via the Federal Register agencies API with real
volume data before adding — and, just as importantly, two candidates from
the original list (the generic Treasury Department parent, and DOJ's
Antitrust Division) were deliberately **not** added after checking real
data showed they'd contribute nothing useful (157 duplicate-tagged items
and 0 items respectively). Also fixed a real bug found during
verification: agency display name was taken from `agencies[0]`, but
Federal Register lists the parent department first even when a tracked
bureau actually matched — OCC/FinCEN items were displaying as generic
"Treasury Department." Verified: re-ran a 918-document sync, all 15
agencies now show correct specific names.

### Rate limiting (commit `cc71ec9`)
Added to `match-relevance`, `company-regulations`, and `harvey-chat` — all
three call the Anthropic API on behalf of any signed-up user, and signup is
intentionally public, so there was no cap on potential cost exposure. New
`rate_limit_events` table + a `SECURITY DEFINER` Postgres function reading
`auth.uid()` internally (never a caller-supplied id, so it can't be
spoofed), with an advisory lock closing the check-then-insert race window.
Limits: 15/hour (`match-relevance`, `company-regulations`), 30/hour
(`harvey-chat`); `rematch-regulation` (added later) uses 20/hour.
`match-relevance`'s service-role/cron path is exempt by construction.
Verified end-to-end: pre-seeded a test user to the limit, confirmed a real
call got 429 with no phantom row recorded, removed one row, confirmed the
next real call succeeded and the count returned to exactly the limit.

### Targeted FINRA notice coverage (commit `d69d9b9`)
The roadmap item ("include NOTICE type documents") sounded like a blanket
type-filter flip, but real numbers showed that would be a 6-7x volume
increase (~6,000 items/9mo, mostly administrative noise) — a bad trade
against the rate limit just added. Didn't implement it as literally
phrased. Found FINRA has no Federal Register agency slug (private SRO, not
a federal agency) and that the API's term search isn't a precise entity
filter (exact-phrase matching only got the true subject right ~45% of the
time). Landed on fetching all SEC NOTICE documents (modest volume, ~7/day)
and filtering client-side on title for "Financial Industry Regulatory
Authority" — reliable because Federal Register's SRO notice titles follow
a consistent pattern. Verified: a 9-month window returned exactly 51 FINRA
notices (matching the ~57 estimate from investigation), all correctly
labeled and substantively real (FINRA Rule 3290, 4522, 4515.01, etc.); a
normal 7-day window stayed proportionate at 17 total items.

## Files most affected (for reference)

- `supabase/functions/regway-ai-chat/index.ts` — streaming rewrite
- `src/components/RegWayAICopilot.tsx` — streaming consumption, markdown, file upload
- `src/lib/markdown.ts` (new) — shared markdown renderer
- `src/lib/functions.ts` (new streaming-capable helper alongside `callFunction`)
- `src/components/Dashboard.tsx` — AI bar auto-scoping, status badges

## Verification approach throughout

`pnpm exec tsc --noEmit` after each item, plus a live check in the
already-running dev server via the browser tool (the dev server at
`localhost:8443` stays up throughout — no need to restart except after
`vite.config.ts`-level changes). Edge function changes get deployed via
`supabase functions deploy <name>` and smoke-tested with a real request
before moving on. For regulation-coverage and matching changes
specifically, verify against the actual database state (row counts, date
ranges, agency spread, real verdicts) rather than just a 200 response.
