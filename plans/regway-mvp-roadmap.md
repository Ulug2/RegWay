# RegWay MVP roadmap

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

**Earlier blocker (resolved):** the Anthropic account ran out of credit mid-pass
("credit balance is too low"). Every AI-calling function fails until it's
topped up: matchers, impact analyses, RegWay AI chat, company scans. The
geopolitical re-check's AI step is the one piece shipped without a live run.

## Priority order

### Live AI tests still owed
Tests run on **H.I.G. Capital** only (the primary test account). Verified
live so far: geopolitical matching, fund-level derived matches and their
analysis, the copilot answering from matched developments ($0.014), copilot
save / resume with multi-turn memory ($0.011), and on H.I.G. on 2026-10-04
($0.94 in total): scheduled matching (80 items, 8 relevant, sensible
verdicts, $0.15), analyses for the 8 new matches (after fixing the cut-off
below) plus the 2 re-written by re-checks (10 × avg $0.077 = $0.77), and
the geopolitical and the regulatory re-check (rows replaced, $0.017).

Still owed. These need the H.I.G. user signed in in the app (the functions
take a user session; testing them by signing in as that user from a script
was refused, rightly):

| What | How to test (as the H.I.G. user) | Est. cost |
|---|---|---|
| Company scan storing a real `why_it_applies` | Edit a company's profile and save (triggers a re-scan), then read "Why it's here" on its new items | $0.20–0.70 |
| Copilot opened from a fund / company page (scoped matches) | Open RegWay AI from GetixHealth's page, ask "what's relevant to this company right now?" | $0.02–0.14 |
| Copilot file upload (.txt/.md/.pdf) (item 11) | Attach a short PDF and ask about it | $0.05–0.15 |
| Analysis of a not-yet-published document | Only when a pre-publication item is matched to H.I.G. (none today: the 4 scheduled for 10-05 were judged not relevant) | $0.06–0.22 |
| Fund rows derived from holdings, on H.I.G. | Record which H.I.G. fund holds each company (company cards); not set yet, so no fund-level derived matches exist | $0.06–0.40 (re-written analyses) |
| Haiku vs Sonnet verdict accuracy (item 9.3) | Same ~40 items through both models, per matcher (script) | ≈ $0.30 |
| **Total** | | **≈ $0.70–1.90** |

### 1. Geopolitical monitoring, Phase 2
Phase 1, fund → company holdings, the geopolitical re-check and the
entity-page category filter are done (see Completed). What's left, roughly
in order of value:
1. **UK/EU sanctions** (OFSI consolidated list, EU sanctions map) and OFAC
   Recent Actions, once a portfolio company with UK/EU-specific exposure
   makes them worth a connector.
2. **One known residual false positive** in the H.I.G. test data: a
   Section 301 "manufacturing sectors" investigation matched to 3Pillar
   Global (software) via India. The model's own reason says the sector fit
   isn't confirmed. Left in place as an honest example of the limit, not
   fixed by more prompt tuning. Same class seen on the holdings test firm
   (2026-10-04): a drone-export rule matched to an aerospace-logistics
   company "if it manufactures UAVs … not recorded". A structural fix is
   the Skeptic pass (item 5), not another prompt rule.

"Live regulation monitoring" (below) is the other large net-new piece of
work. It should be scoped as its own investigate/implement pass.

### 2. Live regulation monitoring (near-real-time, US + global)
**Phase 1a done (2026-10-04)** — see Completed, "Live monitoring, Phase
1a". The audit found the real gap: matching ran only at onboarding, so
firm/fund pages never received anything synced afterwards. **Public
inspection done too** (see Completed, "Pre-publication documents"): the
documents search already returns scheduled documents days early, so no
separate feed was needed; they're now labelled as not yet published.
Remaining: a regulatory pre-filter (not needed at ≈4 items/day yet) and
moving SEC/FINRA/advisories off daily (Phase 2 territory). Original plan
below for reference.

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

### 3. Copilot: ground answers in the firm's currently-relevant regulations — done
See Completed, "Copilot grounded in matched developments".

### 4. Copilot: save and resume chats — done
See Completed, "Copilot conversations: save, resume, memory".

### 5. RegWay AI: multi-role agentic architecture (Orchestrator + Skeptic)
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

Sequenced after items 3–4 above (both are prerequisites/ship-independently
pieces of the same brief) and ahead of items 6–12 below: this is a major
investment directly improving the product's most-scrutinized weakness
(speculative relevance matching), not a UI nice-to-have. Priority within
the brief's own 10 phases: architecture definition → regulation-context
grounding (item 3) → chat history (item 4) → Researcher extraction →
Context Analyst → Impact Analyst → **Skeptic + Citation Checker** → dynamic
routing → parallel execution → evaluation. Do not build past Phase 1
without confirming scope — this is comparable in size to item 1
(geopolitical monitoring).

### 6. Category filter on entity pages — done
See Completed, "Entity-page category filter and search".

### 7. Fact provenance and "last confirmed" dates
On every profile fact. Doc requires every matching fact to show its origin
(user-entered vs. document) and a last-confirmed date, and for missing facts
to render as visibly unknown rather than assumed-absent. Audited: today
`profile` jsonb is a **bare key→value map** — `toRow()` writes
`profile[q.id] = value` directly, `fromRow()` does `Object.assign(answers,
profile)` directly, and `Answers = Record<string, unknown>`
(`questionnaire.ts`). No column, key, or field anywhere is named
`source`/`origin`/`confirmed_at`/`provenance` (checked all migrations and
`types.ts`). The only existing per-answer state is a `missing` boolean
(`QuestionField.tsx`, a "Needed" badge shown only when `required`) — a
non-required empty field renders with no marker at all, indistinguishable
from "confirmed N/A." `_shared/impact.ts`'s `facts()` helper flattens
everything to plain `key: value` strings for the AI prompt, so even if
provenance existed on the row it isn't threaded through to the analysis
today. Needs: each `profile` value becomes `{ value, source, confirmed_at }`
instead of a bare value (touches `toRow`/`fromRow`, every profile display
component, and `facts()`), plus a real "unknown" UI state distinct from
"empty and not required." (`profile_updated_at`, a whole-entity timestamp,
already exists — see Completed — but that's a coarser signal than per-fact
provenance.)

### 8. Duplicate-coverage grouping
The doc wants multiple articles about the same underlying event merged into
one feed entry. Today's dedup is exact-document-only (`upsert` on `source,
external_id`); grouping near-duplicate coverage across sources is a new,
fuzzier matching step — lowest priority of the product-realignment items,
since it only matters once multiple sources cover the same event (i.e.
mainly after geopolitical monitoring adds more source diversity).

### 9. Cost optimization (not yet built)
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
3. **Move to a cheaper model, with an accuracy check first.** Claude Haiku
   4.5 is $1/$5 (3× cheaper than Sonnet 4.5) and fits the matchers' strict
   yes/no verdicts. Claude Sonnet 5.5 is $2/$10 (a third cheaper than
   Sonnet 4.5) and newer, but it rejects forced `tool_choice`, which every
   structured call here uses, so the switch means moving those calls to
   `tool_choice: auto` + `strict: true` (or structured outputs). Either way,
   compare verdicts side by side on real items before switching (≈ $0.30,
   see "Live AI tests still owed").
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

### 10. Re-match discovery after settings edits
The match-correction loop (see Completed) covers *re-checking and
refreshing the explanation* for regulations already matched to an entity.
It deliberately does not cover the other half: *discovering new matches*
after a firm/fund profile edit. Today `match-relevance` only evaluates
regulations with no existing relevance row for a firm (including
"not relevant" marker rows), so editing a firm's jurisdictions or adding a
fund doesn't cause previously-rejected regulations to be re-considered —
the firm/fund dashboard tabs can go stale until the next full match run.
(Portfolio-company edits are handled differently and already work: changing
HQ, sectors or regions clears that company's cached scan so it re-runs via
a fresh on-demand web search on next click — see `saveCompanyAnswers`.)
Building this safely for firm/fund needs more thought than it first
appears: naively clearing a firm's relevance rows and re-running
`match-relevance` would re-evaluate the *entire* historical regulations
backlog against the firm (potentially thousands of items), not just what
the edit actually affects — a real cost/scale risk, which is why this
wasn't done opportunistically alongside the match-correction loop. Likely
superseded by "Live regulation monitoring" (item 2) once that exists, since
an event-driven pipeline removes the need for a special re-discovery path.

### 11. RegWay AI overhaul — remaining verification
The build itself is done (see Completed). Two things flagged but not yet
confirmed:
- The file-upload path (`.txt`/`.md` inlined, `.pdf` as a native document
  block) hasn't been exercised with a real user-provided file.
- Whether the drawer expanding to a full-page view on first message (with
  the suggestion chips disappearing) is the right call — flagged earlier as
  a judgment call on an ambiguous request, still unconfirmed either way.

### 12. Portfolio-company non-US coverage (low priority — mostly already works)
`company-regulations` already builds its search query from a portfolio
company's real HQ location/region and explicitly asks for foreign
regulators when applicable — this works today via live Claude web search,
not a fixed feed. Not guaranteed complete (web search quality varies by
jurisdiction). Revisit only if real usage surfaces specific gaps for a
specific country — don't build ahead of an actual problem.

### 13. Ground AI matching/search in the regulatory source registry doc
From `docs/Regway_US_Regulatory_Source_Master_Registry_Comprehensive_V2.docx`
— the healthcare/trade agencies (item above, Completed) were the quick,
mechanical part. The doc's real scope is far bigger: 52 sections, federal
through tribal/county/professional-licensing-board level. Its own §50
"coverage algorithm" and §50's scope note both say this can't be
statically enumerated (no fixed API per county/board) and should be
*dynamically resolved* per entity — which is exactly what
`company-regulations`'s live Claude web search already does today, just
without this doc's structure to ground it. Two concrete, bounded pieces:
1. **DDTC/ITAR coverage**: §17/§18 name DDTC (defense trade controls) as
   a source directly relevant to A.L.A. and any future defense/aerospace
   portfolio company, but DDTC has no Federal Register agency slug of its
   own — it publishes under the generic `state-department`, which would
   pull in unrelated State Department rulemaking. Same shape of problem
   FINRA's coverage already solved (fetch the parent's documents, filter
   client-side on a reliable title pattern) — needs the equivalent title
   marker investigated for DDTC/ITAR notices before building.
2. **Feed the doc's taxonomy into the live-search prompts** — rather than
   building static integrations for state/local/licensing-board sources
   (the doc itself advises against that), ground `company-regulations`'s
   and `match-relevance`'s prompts in the doc's structured activity →
   source mapping so the AI's web search reasons against an authoritative
   list instead of whatever it happens to surface. Cheaper than new sync
   infrastructure and fits the architecture that already exists. Lower
   priority than item 1 (geopolitical/sanctions) since it's a quality
   improvement to an existing working path, not new coverage from zero.

### Buffer — stretch, only if time remains
- Clean up the two duplicate "NovaPay" test rows in the DB (harmless,
  RLS-isolated, just tidiness — lowest priority item in the whole list).

### Future (no timeline yet)
- **No automated test suite exists** (finding, 2026-10-02): checked
  `package.json` (no test script, no test runner installed — React 19,
  Vite 8, TypeScript, no Vitest/Jest/Playwright/Cypress/Testing Library),
  searched for `*.test.*`/`*.spec.*` files, a `.github/workflows` CI
  pipeline, and `Deno.test` in the edge functions — all empty. Every
  verification in this project to date has been manual: `tsc --noEmit`,
  live browser checks via the browser tool, and direct DB queries (see
  "Verification approach" at the bottom of this doc), plus a few one-off
  standalone scripts for specific things (e.g. the markdown renderer's
  XSS check). That's been adequate for a fast-moving solo build, but it
  means nothing guards against regressions except re-testing by hand.
  Not building a suite unprompted — this is a real gap worth a deliberate
  decision (what to cover first: the matching/relevance logic and the
  markdown renderer are the highest-value unit-test candidates since
  they're pure-ish functions with real edge cases; e2e is a bigger lift
  given everything is gated behind auth + a seeded firm).
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
  Superseded by "Live regulation monitoring" (item 2) if that ships first.
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
