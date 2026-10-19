# How RegWay fits together

A map for new contributors. It says where things are and how a piece of
data travels; the code and the roadmap have the detail.

## The parts

```
 Browser (React app, src/)
    │  reads and writes its own firm's rows        calls functions
    ▼                                                    │
 Supabase Postgres  ◄──────── Edge Functions (supabase/functions/) ──► Anthropic API
 (tables + access rules,          ▲            │                        Federal Register,
  supabase/migrations/)           │            └──────────────────────► regulator feeds
    │                             │
    └── pg_cron (timers inside the database) calls the sync and matching functions
```

- **React app** (`src/`). Runs in the browser, hosted on Vercel. Talks to
  Supabase directly with the public "anon" key plus the signed-in user's
  session. It can only do what the database's access rules allow.
- **Postgres** (`supabase/migrations/`). All data. Row Level Security (RLS)
  rules on each table decide which rows a signed-in user may read or
  change: a user belongs to a firm (`firm_members`) and sees that firm's
  rows only.
- **Edge Functions** (`supabase/functions/`). Server code, one folder per
  function, shared code in `_shared/`. They run on Supabase, written for
  Deno (a JavaScript runtime like Node). They hold the two secrets the
  browser must never see: the service key (reads and writes any row,
  ignoring RLS) and the Anthropic key.
- **AI calls** (`supabase/functions/_shared/ai/`). Every call to Claude goes
  through `callClaude` / `streamClaude` (`client.ts`): one place for the
  headers, timeout, one retry when the API is overloaded, and recording the
  cost in `usage_events`. `runTool` (`structured.ts`) is for answers that
  must come back as structured data, and `models.ts` says which model each
  job uses. New AI work uses these; nothing calls the API directly.
  A failed call is recorded too (`ok = false`, with why in `error`), and
  `ai_status()` (migration 0038) turns repeated failures into a banner on
  the dashboard ("the AI service account has run out of credit").
- **Scheduled jobs.** `pg_cron` runs inside the database and calls
  functions over HTTP on a timer. The schedules are written in migrations.

## Two kinds of data

**Shared, public:** `regulations` holds every document pulled from a public
source (a rule, an enforcement action, a sanctions notice, a travel
advisory). It is the same for every firm.

**Per firm, private:** `firms`, `funds`, `portfolio_companies`,
`fund_holdings` (the firm's profile); `regulation_relevance` (which
documents apply to this firm, fund or company, and why);
`regulation_impacts` (the written analysis); `regulation_flags`,
`regulation_notes`; `regway_ai_conversations` and its messages (the chat);
`profile_changes`, `usage_events`, `rate_limit_events` (bookkeeping).

The rule that makes the product what it is: **the app never lists
`regulations` directly.** It lists `regulation_relevance` rows, so a firm
sees a document only after something judged that it applies to them.

## How a document reaches a user

1. **Sync.** A timer calls a sync function (`sync-federal-register`,
   `sync-regulator-feeds`, `sync-sec-enforcement`, `sync-finra-enforcement`,
   `sync-sec-admin-proceedings`, `sync-travel-advisories`). It fetches from
   the public source and saves rows in `regulations`. No AI, no cost. Each
   run is logged in `sync_runs`; a failing source shows as a banner on the
   dashboard.
2. **Group.** `group-duplicates` links versions of the same development (an
   agency announcement and its later Federal Register text).
3. **Match.** `run-matching` (on a timer, for firms listed in
   `scheduled_matching_firms`), the app after onboarding, or
   `apply-profile-changes` a few minutes after a profile edit, calls the
   matchers:
   `match-relevance`, `match-enforcement-relevance`,
   `match-geopolitical-relevance`. A matcher sends new documents and the
   firm's profile to Claude and stores the verdicts in
   `regulation_relevance`. **This costs money.**

   **Review (the Skeptic).** Between the regulatory and geopolitical
   matchers' verdicts and the table, a second AI pass
   (`_shared/roles/skeptic.ts`, wired in by `_shared/verdictReview.ts`)
   tries to break each "relevant" verdict against the recorded facts: it
   keeps it, moves it to the entity it really rests on, or rejects it. Every
   review is recorded in `verdict_reviews`. Controlled by the
   `SKEPTIC_MODE` secret: `off` (default), `shadow` (record only), `on`.
4. **Analyse.** `regulation-impact` writes the analysis a user reads when
   they open a development (`refresh-entity-impacts` rewrites these after a
   profile edit).
   **This costs money.**
5. **Show.** The dashboard reads `regulation_relevance` joined to
   `regulations` (`src/lib/data.ts`).

On demand, from the app: `company-regulations` (a web-search scan for one
portfolio company), `rematch-regulation` ("this match looks wrong"), and
`regway-ai-chat` (the chat, streamed).

**Web research on the firm.** After onboarding (and from Profile, "Research
Again"), `research-firm` searches the web for the firm, its funds and its
companies and stores proposals in `firm_findings` (migration 0039), each in
a questionnaire field (`_shared/research/fields.ts` reads the questions from
`src/lib/questionnaire.ts`) with the page it came from. A proposal enters
the profile only when the user confirms it in Profile, "Found on the Web"
(saved with `profile_meta` source `web` and the link). Until then only the
chat sees it, marked unconfirmed; matching, analyses and the Skeptic read
the confirmed profile only.

When a chat answer claims that something applies (or doesn't) to the firm,
a fund or a company, `regway-ai-chat` checks it after the answer has
streamed (`regway-ai-chat/review.ts`): a cheap call finds such claims
(`roles/claimGate.ts`); then the Skeptic checks them against the recorded
facts and RegWay's matches, and `roles/citationCheck.ts` against the
passages the answer cited, each shown to the user as a step label; the
result is a short note under the answer, saved in
`regway_ai_messages.review`. Controlled by the `CHAT_REVIEW` secret (`on`;
off by default).

Every AI call is recorded in `usage_events` (`_shared/usage.ts`), and
user-triggered functions are rate limited (`check_rate_limit`, migration
0005).

## The frontend

- `src/main.tsx` mounts `src/App.tsx`, which picks a screen from the
  address (`src/lib/router.ts`): landing page, public pages
  (`InfoPage.tsx`), dashboard, a fund or company page (`EntityPage.tsx`), a
  development (`HeadlineDetailView.tsx`), profile, chat.
- `src/lib/data.ts` holds nearly all database queries (a few components
  still query directly; new queries belong in `data.ts`).
  `src/lib/functions.ts` is how the app calls Edge Functions.
- `src/lib/` otherwise holds pure logic with unit tests (filters,
  duplicate grouping, the questionnaire, a Markdown renderer).
- Styling: Tailwind v4 classes in JSX, shared classes and colour variables
  in `src/index.css`. `DESIGN.md` says how the interface should look.

## Tests

- `tests/unit/` (Vitest) runs `src/lib` and the functions' code against a
  fake database client and a stubbed `fetch` (`tests/unit/helpers/`).
- `tests/e2e/` (Playwright) drives the real app in a browser against a mock
  Supabase (`tests/e2e/mockBackend.ts`).

Neither can reach a real project or the AI.

## Environments

| | Where | Who has access |
|---|---|---|
| **Local** | Your machine: `supabase start` + `pnpm dev` | You |
| **Production** | Vercel (regwayai.com) + the hosted Supabase project | Owner only |

There is no shared staging environment. Migrations and functions are
applied to production by the owner, by hand, after a merge.

The migrations write the hosted project's address into the scheduled jobs.
`supabase/seed.sql` removes those jobs from a local database so it does not
call production; do not remove that file.

## Where decisions are recorded

`plans/regway-mvp-roadmap.md` (what is open and who it waits on),
`docs/archive/roadmap-history.md` (what was built, what the owner decided
and when, and how each piece was verified),
`plans/regway-ai-multi-agent-architecture.md` (the AI redesign in
progress), and `docs/notes/` (investigation and implementation notes, one
pair per feature).
