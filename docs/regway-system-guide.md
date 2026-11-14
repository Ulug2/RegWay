# RegWay: the complete system guide

What RegWay is, how it was designed, how its AI agents work, and how every
part fits together. Written 2026-11-14 from the code as it stands on `main`.
For a quick map of the folders read [`architecture.md`](architecture.md); for
setting up a laptop read [`onboarding.md`](onboarding.md). This guide is the
long version: read it once to understand the whole product.

**Contents**
1. [What RegWay is](#1-what-regway-is)
2. [The product, screen by screen](#2-the-product-screen-by-screen)
3. [The design principles](#3-the-design-principles)
4. [The system at a glance](#4-the-system-at-a-glance)
5. [The data](#5-the-data)
6. [How a development reaches a firm](#6-how-a-development-reaches-a-firm)
7. [The AI agents](#7-the-ai-agents)
8. [The chat (RegWay AI)](#8-the-chat-regway-ai)
9. [Keeping a firm's profile right](#9-keeping-a-firms-profile-right)
10. [Emails](#10-emails)
11. [Timers](#11-timers)
12. [Security](#12-security)
13. [Costs](#13-costs)
14. [The frontend](#14-the-frontend)
15. [Testing, environments and deploying](#15-testing-environments-and-deploying)
16. [State of production and known gaps](#16-state-of-production-and-known-gaps)

---

## 1. What RegWay is

A private equity firm raises **funds**, and each fund owns **portfolio
companies**: a software company in Texas, a battery maker in Germany, a
hospital group in Florida. Every day US, UK and EU regulators publish new
rules, enforcement actions, sanctions and trade measures. Almost none of
them matter to any one firm. The few that do usually hit one company, in one
industry and one country, not the firm itself.

Today a firm's compliance team finds those by reading law-firm newsletters
and generic regulatory feeds, then working out by hand which of their 20 to
100 companies each item touches.

**RegWay does that work.** It reads official public sources, and for each
firm shows only what applies to that firm, one of its funds, or one of its
portfolio companies, with:

- **why** it applies (one sentence naming the entity and the fact it rests on),
- **a written analysis** (what the measure does, what it means for the
  entity, dates, what is not known),
- **a chat** ("RegWay AI") that answers questions about the firm's own
  situation, with sources,
- **emails** when something new applies.

The one rule that makes the product what it is: **the app never lists all
documents. It lists matches.** A firm sees a document only after something
judged that it applies to that firm.

Who it is for: the general counsel, chief compliance officer or operating
partner of a US-based PE firm. The firm and its funds are always US-based;
portfolio companies can be anywhere.

The test account is **H.I.G. Capital**: a real firm's public facts plus
invented funds and companies whose names end in "(test)".

---

## 2. The product, screen by screen

| Address | Screen | What it does |
|---|---|---|
| `/` signed out | Landing page | What RegWay does; sign in and sign up open here (`/sign-in`, `/sign-up`). |
| `/about`, `/sources`, `/legal`, `/privacy` | Public pages | The team, the sources read, disclaimers, privacy. Contact: team@regwayai.com. |
| `/` first sign-in | Onboarding | A short questionnaire: the firm (name, HQ, type, industries, geographies, adviser registration), its funds, its portfolio companies. Then matching starts and RegWay researches the firm on the web. |
| `/` signed in | Dashboard | Three levels: **General Partners** (the firm), **Funds**, **Portfolio Companies**. Each lists the developments matched at that level, newest first, day by day. A setup reminder (profile completeness), a banner when a source or the AI is failing, and the "Ask RegWay AI" bar. |
| `/funds/:id`, `/companies/:id` | Fund or company page | Everything matched to that one entity, its recorded facts, and a company's web-scan results. |
| `/developments/:id` | A development | The document, why it applies, the analysis, other versions ("also published as"), flag, notes, dismiss, "this match looks wrong" (re-check), and "Ask RegWay AI" about it. |
| (drawer over any screen) | RegWay AI chat | Questions about the firm, a fund, a company or one development. Streams the answer, cites sources, keeps a conversation history. |
| `/profile`, `/profile/:tab` | Profile | **Account** (name, email, password, theme, email alerts), **Firm**, **Funds**, **Portfolio** (the full questionnaire and fund holdings), **Found on the Web** (research to confirm), **Dismissed**, **Hidden** (matches the Skeptic took away, with a Restore button). |

"Profile" means the person (name, email, password). The firm's details, funds
and companies are edited in the other Profile tabs.

---

## 3. The design principles

These decisions shape every part of the system. When you change something,
keep them.

1. **Matches, never a feed.** Nothing reaches a user unless a match row
   (`regulation_relevance`) says it applies to their firm, a fund or a
   company.
2. **Code decides what code can decide; AI only judges.** Free filters run
   first: which sources a firm can be affected by (a US-only firm never sees
   UK rules), which countries it touches, which documents were already
   judged. Fund exposure is computed from recorded holdings, never asked of
   a model, so a model can never invent an ownership link.
3. **Every claim rests on a recorded fact.** The AI is given the firm's
   recorded facts and told to name the one a match rests on. Facts that are
   not recorded are listed as "not recorded" (unknown, not "no"). Facts not
   confirmed for over a year are marked as such.
4. **A second AI tries to break every match** (the Skeptic, §7.4). A model
   is a weak critic of its own reasoning, so a separate call with a mandate
   to disagree reviews each match before a firm sees it.
5. **Same question, same answer.** Every verdict call runs at temperature 0
   and returns structured data through a tool, not free text.
6. **Nothing is judged twice.** A "not relevant" verdict is stored too (as a
   row whose reason starts `NOT_RELEVANT:`), so the next run skips it. A
   profile edit forgets recent rejections on purpose, so they get judged
   again against the new facts.
7. **Every AI call is recorded** (`usage_events`: function, model, tokens,
   cost, success or failure). Failures turn into a dashboard banner and an
   email.
8. **The browser never holds a secret.** It talks to the database with the
   public key and the user's session; the database's access rules decide
   what it may read. The AI key and the service key live only on the server.
9. **Missing information stays visibly unknown,** in the analysis, the chat
   and the matches ("Depends on facts not recorded: …").

---

## 4. The system at a glance

```
 Public sources                          Supabase (one project)                         Anthropic (Claude)
 ──────────────                          ──────────────────────                         ──────────────────
 Federal Register API ─┐        ┌──────────────── Edge Functions (Deno) ───────────────┐
 SEC, FTC, CFPB feeds ─┤        │ sync-*         read sources, store documents (free)  │
 FCA, PRA, ESMA, EUR-Lex├──────►│ group-duplicates  link versions of one development  ├──► Haiku / Sonnet
 UK & EU sanctions ────┤        │ run-matching → match-* judge documents per firm      │    (+ web search)
 SEC/FINRA enforcement ┤        │ regulation-impact  write the analysis                │
 State Dept advisories ┘        │ regway-ai-chat     the chat                          │
                                │ research-firm, company-regulations  web research     │
                                │ send-match-alerts, ai-outage-email  emails ──────────┼──► Resend
                                └───────────────▲──────────────────────────┬───────────┘
                                                │ pg_cron timers           │ service key
                                ┌───────────────┴──────────────────────────▼───────────┐
                                │ Postgres: documents, firms, matches, analyses, chat   │
                                │ Row Level Security: each user sees their firm only    │
                                └───────────────▲──────────────────────────────────────┘
                                                │ public key + the user's session
 Browser (React app on Vercel, regwayai.com) ───┘   and calls to the functions above
```

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, hosted on
  Vercel. `src/`.
- **Database:** Supabase Postgres, 43 numbered migrations in
  `supabase/migrations/`. Row Level Security on every table.
- **Server code:** 21 Supabase Edge Functions (Deno) in
  `supabase/functions/`, shared code in `_shared/`.
- **AI:** Anthropic Claude only, called only from Edge Functions, only
  through `_shared/ai/` (`callClaude`, `streamClaude`, `runTool`).
- **Email:** Resend, from the regwayai.com domain, only through
  `_shared/email.ts`.
- **Timers:** `pg_cron` inside the database calls functions over HTTP.

---

## 5. The data

### Shared by everyone

| Table | What it holds |
|---|---|
| `regulations` | Every document read from a public source: rules, proposed rules, agency announcements, enforcement actions, sanctions, trade measures, travel advisories, and company web-scan results. Columns that matter: `source`, `category` (`regulatory`, `enforcement`, `geopolitical`), `countries` (named in it), `published_date`, `effective_date`, `duplicate_of` (a later version points at the first), `raw`. Readable by any signed-in user. |
| `sync_runs` | One row per sync or job run: `source`, `ok`, `detail`, `stats`. Feeds the "this source hasn't updated" banner. |

### Per firm (private)

| Table | What it holds |
|---|---|
| `firms`, `funds`, `portfolio_companies` | The firm's profile. Columns for the core facts plus `profile` (every questionnaire answer, JSON) and `profile_meta` (when each answer was confirmed and where it came from: typed in, or confirmed from the web with its link). |
| `fund_holdings` | Which fund holds which company (a company can sit in several funds). |
| `firm_members` | Which user belongs to which firm (one firm per user today). |
| `regulation_relevance` | **The matches.** One row per (document, firm, fund or company). `relevance_reason` is the one-sentence why; it starts `NOT_RELEVANT:` for a rejection (kept so it isn't judged again), `NOT_RELEVANT: Reviewed:` when the Skeptic rejected it. `via_holdings` marks a fund row computed from holdings. `dismissed_at` when the user dismissed it. |
| `regulation_impacts` | The written analysis per (document, firm). |
| `regulation_flags`, `regulation_notes` | The user's flags and notes on a development. |
| `regway_ai_conversations`, `regway_ai_messages` | The chat: conversations (with their focus: firm, fund, company or development) and messages (with the check's note, `review`). |
| `firm_research_runs`, `firm_findings` | Web research on the firm and its proposals waiting to be confirmed. |
| `profile_changes` | Edits waiting for their AI follow-up (§9). |
| `email_preferences`, `match_alert_items` | Whether a person gets alert emails, and which matches they were already emailed about. |

### Internal (server only, no access for users)

| Table | What it holds |
|---|---|
| `usage_events` | Every AI call: function, model, tokens, cost, ok, error. |
| `verdict_reviews` | Every Skeptic review: the original verdict, the decision (keep, move, reject, failed), the reason. |
| `scheduled_matching_firms` | Which firms the timer matches (only H.I.G. today) and when a re-check was requested. |
| `rate_limit_events` | Per-user rate limiting of AI-spending functions (`check_rate_limit`). |
| `ai_outage_emails` | Outage emails sent to the owner. |

Database functions worth knowing: `auth_firm_id()` (the signed-in user's
firm, used by every access rule), `check_rate_limit`, `ai_status()` (is the
AI failing now), `restore_reviewed_match`, `alert_recipients`.

---

## 6. How a development reaches a firm

```
 1 SYNC ─► 2 GROUP ─► 3 PRE-FILTER ─► 4 JUDGE (AI) ─► 5 SKEPTIC (AI) ─► 6 STORE ─► 7 HOLDINGS ─► 8 ANALYSE (AI) ─► 9 SHOW + EMAIL
```

1. **Sync (free).** Timers call the sync functions. Each fetches a public
   source and upserts rows into `regulations`, tagging each with a
   `category` and the `countries` it names.

   | Function | Source | Category |
   |---|---|---|
   | `sync-federal-register` | Federal Register API, 64 agencies: rules and proposed rules (notices only where filtered, e.g. FINRA rule filings) | regulatory, or geopolitical for sanctions, export controls, trade |
   | `sync-regulator-feeds` | SEC, FTC, CFPB announcements; FCA, PRA, UK legislation, ESMA, EUR-Lex; EU and UK sanctions, OFSI (`_shared/regulatorFeeds.ts`) | regulatory / geopolitical |
   | `sync-sec-enforcement` | SEC litigation releases | enforcement |
   | `sync-finra-enforcement` | FINRA news releases, filtered to bars, fines, suspensions | enforcement |
   | `sync-sec-admin-proceedings` | SEC administrative proceedings (PDFs, read by Claude: costs AI) | enforcement |
   | `sync-travel-advisories` | State Department advisories, levels 3 and 4 | geopolitical |

2. **Group.** `group-duplicates` links versions of one development, so the
   dashboard shows one card with "also published as" links: the same title
   from one source, an EU sanctions Decision and its Regulation, a company
   scan's result that is a Federal Register document (all by identifiers,
   no AI), and an agency's announcement with its later Federal Register
   document (one small Haiku call per new document).

3. **Pre-filter (free).** Per firm, the matcher picks candidates: the newest
   200 documents of its category, from the sources the firm can be affected
   by, minus every document already judged for this firm. UK and EU items
   only for a firm connected to those regions. Geopolitical items only when
   they name a country the firm or a company is connected to (or no country
   at all, when anything is outside the US).

4. **Judge (AI).** Up to 40 candidates at a time go to the matcher's judge
   with the firm's recorded facts. The judge returns, for every item:
   relevant or not, one-sentence reason, and the entity it applies to
   (firm, a fund, a company).

5. **Skeptic (AI).** Every "relevant" verdict is reviewed by a separate call
   (§7.4): keep, move to the right entity, or reject. On in production
   (`SKEPTIC_MODE=on`) for the regulatory and geopolitical matchers.

6. **Store.** Verdicts become `regulation_relevance` rows, relevant and not.

7. **Holdings (free).** For geopolitical matches, fund rows are computed
   from `fund_holdings`: "Fund II holds Acme, which operates in a country
   under this measure". Rebuilt from scratch on each run.

8. **Analyse (AI).** New matches get their analysis written in the
   background (`regulation-impact`, up to 8 per run), so it is ready when
   someone opens the development. Otherwise it is written when first opened.

9. **Show and email.** The dashboard reads the firm's match rows joined to
   the documents. `send-match-alerts` emails each person what newly matched
   (§10).

**What starts matching:**
- `run-matching` on a timer (every 30 minutes) for firms in
  `scheduled_matching_firms`. It skips a run when no document and no
  re-check arrived since the last one. Each run calls the three matchers
  once per firm; a backlog clears over the following runs.
- Onboarding: the app calls the three matchers once.
- The dashboard calls the geopolitical matcher when it loads.
- `apply-profile-changes` after a profile edit (§9).
- `rematch-regulation` when a user says a match looks wrong: the
  development is judged again with the user's note, replacing the old
  verdicts.

---

## 7. The AI agents

RegWay uses Claude in narrow roles. Each role has one job, its own prompt,
structured output where it returns data, and its cost recorded.

| Agent | Model | Where | Job | Runs when |
|---|---|---|---|---|
| Regulatory judge | Haiku 4.5 | `_shared/regulatoryJudge.ts` | Does a rule create a real obligation for this firm, a fund or a company? | Matching |
| Geopolitical judge | Sonnet 4.5 | `_shared/geopoliticalJudge.ts` | Does a sanction, export control, trade measure or advisory reach an entity through where it is? | Matching |
| Enforcement judge | Sonnet 4.5 | `match-enforcement-relevance` | Does a case against someone else overlap with an entity's own activity? | Matching |
| Skeptic | Sonnet 4.5 | `_shared/roles/skeptic.ts` | Try to break each match: keep, move, reject. Also checks chat claims. | After each judge; after chat answers |
| Impact analyst | Sonnet 4.5 | `_shared/impact.ts` | Write the analysis of one development for one firm. | After a new match; on first open; after a profile edit |
| Company scanner | Sonnet 4.5 + web search | `company-regulations` | Find recent regulatory activity for one portfolio company. | New company, after an edit, weekly |
| Firm researcher | Sonnet 4.5 + web search | `research-firm` | Find public facts about the firm, its funds and companies, as proposals to confirm. | After onboarding; "Research Again" |
| Announcement matcher | Haiku 4.5 | `_shared/duplicates.ts` | Which agency announcement (if any) announced this Federal Register document? | `group-duplicates` |
| Chat | Sonnet 4.5 + web search | `regway-ai-chat` | Answer questions about the firm's situation. | Each message |
| Claim gate | Haiku 4.5 | `_shared/roles/claimGate.ts` | Does a chat answer claim something applies to an entity? | After each chat answer |
| Citation check | Haiku 4.5 | `_shared/roles/citationCheck.ts` | Does what the answer says about a rule match the passage it cited? | After an answer with claims |
| SEC PDF reader | Sonnet 4.5 | `sync-sec-admin-proceedings` | Turn an SEC proceeding PDF into a headline and plain text. | That sync, every 3 hours |

All model choices are in one file, `_shared/ai/models.ts`. A model is
changed only after its accuracy on that job was checked (the regulatory
judge moved to Haiku after agreeing with Sonnet on 40 of 40 verdicts;
Haiku was rejected for the geopolitical judge because it linked sanctions
on people in a country to any company there).

### 7.1 How every call is made

`_shared/ai/client.ts` is the only way to call Claude:
- `callClaude` (one answer), `streamClaude` (the chat's stream),
  `runTool` (`structured.ts`: a forced tool call whose answer is checked by
  a function, with one retry when the answer breaks the rules, e.g. a
  review missing for one match).
- A timeout on every call, one retry when Anthropic is overloaded (429,
  5xx), no retry on a bad request or no credit.
- Prompt caching: the firm's facts and the tool definitions are marked
  cacheable, since they repeat across batches.
- Every call, successful or failed, recorded in `usage_events` with why it
  failed (`credit`, `auth`, `rate_limited`, `unavailable`, `timeout`,
  `other`).

### 7.2 The three judges

They share one shape (`_shared/relevance.ts`): resolve the caller's firm
(a user only ever matches their own firm; the service key names one),
load the firm's entities, pick unjudged candidates, call the judge, run the
Skeptic, store the rows, write analyses in the background. Each is rate
limited to 15 calls an hour per user.

- **Regulatory judge.** Told to be strict: mark relevant only when it can
  name the specific new obligation, deadline or requirement and the
  specific entity it touches; never for "may", "could" or "might"; never
  for administrative items (corrections, comment-period extensions, an
  individual's case). A UK or EU item binds only an entity recorded as
  connected there. Uses the questionnaire answers that sharpen a match:
  adviser registration (which SEC rules apply), strategies, industries,
  each fund's proposed-rule preference.
- **Geopolitical judge.** The code first computes each entity's
  **footprint** (`_shared/footprint.ts`): which countries it touches and
  how (headquarters, operations, suppliers). The judge gets the exact
  overlap the code found and must explain that connection, not invent one.
  Verdicts stand on the firm or a company; fund rows come from holdings.
- **Enforcement judge.** A case is against someone else, so relevance means
  a real overlap between the conduct alleged and the entity's own activity
  (same instrument, customer type or practice), never a shared industry
  label. The reason must never imply the entity did anything wrong. Not yet
  reviewed by the Skeptic.

### 7.3 Re-checks

`rematch-regulation` re-judges one development with the exact prompt the
original matcher used, plus the user's note ("we don't import batteries"),
against the profile as it is now. It replaces the firm's verdicts on that
development (a match no longer supported leaves the entity's page).
Enforcement re-checks are not supported yet.

### 7.4 The Skeptic

A separate Sonnet call, at temperature 0, whose only job is to break each
match. It gets the firm's recorded facts (what is recorded, what is not,
what is over a year old) and a nine-point checklist:

1. Does the connection need a fact that is not recorded?
2. Does it really run through a different entity?
3. Does the measure bind this kind of entity at all?
4. Is the entity inside the measure's scope (products, sectors, places)?
5. Would it create, change or remove a real obligation?
6. Proposed vs final, published vs effective dates stated correctly?
7. Does a recorded threshold or exemption take it out?
8. Jurisdiction: UK/EU/state measures bind only entities recorded there.
9. Argue the opposite; if that is as strong, the match is not supported.

It returns keep (optionally listing the unrecorded fact the match depends
on, shown to the user as "Depends on facts not recorded: …"), move (to the
entity the match really rests on), or reject. Every review is stored in
`verdict_reviews`. A review that fails never blocks matching: the verdicts
pass through as the judge gave them. Rejected matches appear in
Profile → Hidden, where the user can restore them.

Measured on H.I.G. (October 2026): the judges alone had put about 14 wrong
matches among 29; after the Skeptic, the latest round was 10 of 11 right.

`SKEPTIC_MODE`: `off`, `shadow` (review and record, change nothing), `on`
(production). `review-existing-matches` runs it over matches made before it
existed (owner only).

### 7.5 The impact analyst

`_shared/impact.ts`: for one development and one firm, a neutral analysis
of what the measure does and what it means for each matched entity, from
up to 60,000 characters of the document's text and the entity's recorded
facts. Stored in `regulation_impacts`. Rewritten after a profile edit to a
matched entity (`refresh-entity-impacts`).

### 7.6 The company scanner

`company-regulations`: for one portfolio company, a Sonnet call with web
search (up to 5 searches) built from the company's sectors, locations and
what it does, then a second call that forces the findings into a strict
list. Each finding is stored as a `regulations` row (`source = 'ai_search'`)
matched to the company, with `why_it_applies`. The app runs it in the
background (`src/lib/scans.ts`) for a new company, five minutes after the
last edit to a company, and weekly. About $0.20 a scan.

### 7.7 The firm researcher

`research-firm`: after onboarding, a Sonnet call with up to 8 web searches
finds public facts about the firm, its funds and its companies, then a
forced-tool extraction maps them onto questionnaire fields. A finding is
kept only if it cites a page the search read, names a listed entity and
fits that question's options. Nothing enters the profile until the user
confirms it in Profile → Found on the Web; until then only the chat sees
it, marked unconfirmed. On H.I.G.: 13 findings in about 2 minutes for
$0.61.

---

## 8. The chat (RegWay AI)

`regway-ai-chat` answers in one streamed Sonnet call with web search (up to
5 searches). Its system prompt (`regway-ai-chat/prompt.ts`) holds the
firm's recorded facts, its current matches, the focus of the conversation
(the firm, a fund, a company or one development) and any unconfirmed web
findings, marked as such. Earlier turns of the conversation are sent too.

After the answer has streamed, **the check** (`regway-ai-chat/review.ts`,
`CHAT_REVIEW=on`):
1. The claim gate (Haiku) looks for claims that something applies, or
   doesn't, to the firm, a fund or a company. Most answers have none and
   stop here.
2. The Skeptic checks each claim against the recorded facts and RegWay's
   matches; the citation check (Haiku) compares what the answer said about
   the rule with the passage it cited.
3. The user sees step labels while it runs, then a short note under the
   answer if something is off. The note is saved with the message.

Stop works by stamping the conversation (`stopped_at`), which the function
watches; a stopped answer is not saved.

---

## 9. Keeping a firm's profile right

The quality of every match depends on the firm's recorded facts, so the
product works to keep them complete and current:

- **The questionnaire** (`src/lib/questionnaire.ts`) is one list of
  questions shared by onboarding, Profile and the server (the researcher
  reads its options). Onboarding asks only what changes matching; the rest
  is answered later from Profile, with a completeness ring.
- **Provenance** (`profile_meta`): each answer records when it was
  confirmed and where it came from. Facts over a year old are marked to the
  AI and to the user.
- **After an edit** (`apply-profile-changes`, every minute): a save records
  what it needs in `profile_changes`. Once a firm's edits have been quiet
  for five minutes, one round of AI work runs: the analyses of what the
  edited entity is matched to are rewritten, and recent rejections are
  judged again against the new facts (geopolitical ones too when a
  location changed). Several edits cost one round.

---

## 10. Emails

All email goes through Resend from the regwayai.com domain
(`_shared/email.ts`, secret `RESEND_API_KEY`).

| Email | Sent by | To | When |
|---|---|---|---|
| Match alerts | `send-match-alerts` (every 30 min, :25/:55) | Each person of a firm | Something new matched their firm, a fund or a company. One email per run listing headlines ("Applies to …") and "Open your dashboard". Off in Profile → Account. |
| AI outage | `ai-outage-email` (every 15 min) | team@regwayai.com | The AI keeps failing (3+ failed calls since the last one that worked). Once per outage, with why and what to do. |
| Sign-up confirmation, password reset, email change | Supabase Auth | The user | RegWay's own templates in `supabase/templates/`, pasted into the hosted project's dashboard. |

What an alert leaves out: Skeptic rejections, dismissed matches, later
versions of a development already shown, a firm's first 24 hours (it is
being set up), and anything already emailed (`match_alert_items`).

Planned: **the Morning Brief**, at 7 am in each person's own time zone,
listing every match since the last brief.

---

## 11. Timers

All in the database (`cron.job`), written in migrations. A local database
removes them (`supabase/seed.sql`) so it never calls production.

| Job | When | Calls | AI? |
|---|---|---|---|
| `sync-federal-register-30min` | every 30 min | sync-federal-register | no |
| `sync-regulator-feeds-30min` | every 30 min | sync-regulator-feeds | no |
| `sync-sec-enforcement-hourly`, `sync-finra-enforcement-hourly` | hourly | the enforcement syncs | no |
| `sync-sec-admin-proceedings-3h` | every 3 h | sync-sec-admin-proceedings | yes (PDFs) |
| `sync-travel-advisories-6h` | every 6 h | sync-travel-advisories | no |
| `group-duplicates-30min` | :08, :38 | group-duplicates | small (Haiku) |
| `run-matching-30min` | :10, :40 | run-matching → the matchers | **yes** |
| `send-match-alerts-30min` | :25, :55 | send-match-alerts | no |
| `ai-outage-email-15min` | :03, :18, :33, :48 | ai-outage-email | no |
| `apply-profile-changes-1min` | every minute | apply-profile-changes | when an edit is due |

---

## 12. Security

- **Access rules (RLS) on every table.** A user reads and changes only their
  own firm's rows (`auth_firm_id()`). Internal tables (`usage_events`,
  `verdict_reviews`, `rate_limit_events`, `ai_outage_emails`,
  `match_alert_items`, `scheduled_matching_firms`) have no rules at all, so
  only the server can touch them. Documents (`regulations`) are readable by
  any signed-in user: they are public.
- **Functions check their caller.** User-facing functions take the user's
  session and work out the firm from it; a user can never name another
  firm. Every job the timers run (the syncs, `run-matching`,
  `group-duplicates`, `apply-profile-changes`, the email jobs) and
  `review-existing-matches` accept only the service key, which the timers
  read from the database vault. (Until 2026-11-14 the syncs accepted the
  public key, so anyone could run them.)
- **Secrets** (Supabase function secrets, never in the repository):
  `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, the service key; switches
  `SKEPTIC_MODE`, `CHAT_REVIEW`. The timers read the service key from the
  database vault.
- **Rate limits** on every AI-spending function a user can trigger
  (`check_rate_limit`: 3 a day for web research, 6 to 30 an hour for the
  rest).
- **Not done yet** (roadmap 16g, the security audit): two-account access
  tests (issue #12), sign-in rate limits of our own, security headers
  (issue #40), an audit log, an outside test.

---

## 13. Costs

Measured per call (October 2026): company scan $0.20; impact analysis
$0.06 on average (up to $0.22); a matcher batch of 40 documents $0.05;
chat message $0.06 to $0.07; re-check $0.01 or less; firm research $0.61.
Emails cost nothing on Resend's free plan (3,000 a month).

What spends money without anyone asking: the matching timer (for enrolled
firms), background analyses of new matches, weekly company scans when the
dashboard is opened, `group-duplicates`' small Haiku calls, and the SEC
proceedings sync.

**The pause switch.** The `AUTOMATIC_AI` secret set to `off`
(`_shared/ai/switch.ts`) stops all of that at once: company scans,
background analyses, the matchers, duplicate grouping's AI step, the SEC
proceedings reader and the after-edit re-checks. Still on, because each is
a click: the chat, the analysis of a development someone opens, "this match
looks wrong", and web research on the firm. Edits made while paused stay
queued. On in production since 2026-11-14 (`supabase secrets unset
AUTOMATIC_AI` to resume). The model behind the numbers is in
`plans/ai-cost-model.md`.

---

## 14. The frontend

- `src/main.tsx` mounts `src/App.tsx`, which picks the screen from the
  address (`src/lib/router.ts`, no routing library). Screens other than
  the landing and public pages load on demand.
- `src/lib/data.ts` holds the database queries, `src/lib/functions.ts`
  calls Edge Functions, `src/lib/cache.ts` keeps the last data per user so
  screens open instantly.
- `src/lib/` otherwise holds pure, unit-tested logic: duplicate grouping,
  feed filters, the questionnaire, the Markdown renderer for the chat, scan
  scheduling.
- Look and feel: `DESIGN.md` (one accent colour, light and dark themes,
  phone widths), shared classes in `src/index.css`, icons from
  `src/components/icons.ts`.

---

## 15. Testing, environments and deploying

- **Unit tests** (`tests/unit/`, Vitest, 520+): `src/lib` and every
  function's code, against a fake database client and a stubbed `fetch`.
- **Browser tests** (`tests/e2e/`, Playwright, 170+): the real app against
  a mock Supabase (`tests/e2e/mockBackend.ts`). No test reaches a real
  project, Resend or the AI.
- `pnpm test:all` runs types, function types, unit and browser tests.
- **Environments:** local (`supabase start`, `pnpm dev`; contributors never
  hold production keys) and production (Vercel + the hosted Supabase
  project, owner only). No staging.
- **Deploying:** merging to `main` deploys the website (Vercel). Database
  migrations and functions are applied to production by the owner, by
  hand. Production records migrations from 0021 on by date, not by number,
  so `supabase db push` would try to run 0021–0043 again: apply a new
  migration on its own (the SQL editor or `apply_migration`), never with
  `db push`.
- Team process: `CONTRIBUTING.md`, `docs/onboarding.md`.

---

## 16. State of production and known gaps

As of 2026-11-14:

- **The AI account was out of credit** from early November (no successful
  call between 2026-10-19 and 2026-11-14) and was topped up on 2026-11-14.
  Opening the dashboard right after started 9 company scans and 43
  background analyses (about $4.80): opening the app spends money when
  scans are due (§13).
- **Automatic AI work is paused** (`AUTOMATIC_AI=off`, §13) since
  2026-11-14, to save credit.
- **The matching timer is switched off** (`run-matching-30min` inactive
  since 2026-10-18, kept off by the owner on 2026-11-14 to save credit).
  290+ documents have arrived since and were never judged for H.I.G.
  Turning it back on catches them up.
- **GitHub Actions is not starting** (every run since 2026-11-07 fails to
  start, probably minutes or billing on the private repository). Run
  `pnpm test:all` before merging until it is fixed.
- **Vercel previews** fail for contributors who are not on the Vercel team
  (the Hobby plan). Production deploys work.
- Open work and decisions: `plans/regway-mvp-roadmap.md`. What was built,
  decided and verified: `docs/archive/roadmap-history.md`.
