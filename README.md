# RegWay

AI-powered regulatory intelligence for private equity firms and general partners.

RegWay watches real regulatory activity (starting with US federal rules) and
filters it down to only what actually affects a given firm — its jurisdictions,
its fund structures, and its portfolio companies — instead of dumping every
new rule on the user. It's built as a private, single-firm-per-account
workspace: sign up, describe your firm/funds/portfolio companies, and the app
starts surfacing regulations that genuinely apply to you, with an AI copilot
(RegWay AI) that can search the live web and answer questions grounded in real
sources and citations.

## What it does

- **Real regulatory data** — a Supabase Edge Function pulls new/proposed
  federal rules from the free, official [Federal Register API](https://www.federalregister.gov/developers/documentation/api/v1)
  (SEC, CFTC, IRS, DOL, EPA, FERC, HHS, FMCSA, CFPB).
- **Relevance filtering, not a firehose** — every synced rule is evaluated by
  Claude against the firm's actual jurisdictions, funds, and portfolio
  companies. Only rules with a genuine, explainable connection are ever shown;
  everything else is discarded with a stated reason. Nothing is shown just
  because it exists.
- **Per-company AI web search** — clicking into a portfolio company triggers
  an on-demand Claude + web-search scan built from that company's sector and
  location, so a fintech company in New York and an energy company in Texas
  get different, relevant results instead of a generic feed.
- **RegWay AI copilot** — a chat interface with full firm/fund/portfolio
  context, grounded in live web search, that always cites its sources.
- **User-driven flags and notes** — no pre-baked "Critical/Flagged/Low Impact"
  labels. Users decide what matters to their firm and can flag items or leave
  internal notes, both persisted per firm.

## Tech stack

- **Frontend**: React 19 + Vite + Tailwind CSS v4, running inside the Figma
  Make dev environment (see `AGENTS.md`)
- **Backend**: [Supabase](https://supabase.com) — Postgres with Row Level
  Security scoping every firm to its own data, Auth for sign-up/sign-in, and
  Edge Functions (Deno) for anything that needs to call an external API
- **AI**: [Anthropic Claude API](https://docs.anthropic.com), called only
  from Edge Functions — the API key never reaches the browser

## Project structure

```
src/
  components/       React UI components (Dashboard, HeadlineDetailView,
                     OnboardingModal, AuthScreen, RegWayAICopilot)
  lib/               Supabase client, typed data-access helpers, edge
                     function caller
supabase/
  migrations/        Postgres schema + RLS policies
  functions/         Edge Functions (Deno) — see supabase/README.md
  README.md          Backend setup steps (Supabase project, secrets, deploy)
```

## Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in your Supabase project URL + anon key
pnpm dev
```

The frontend alone won't have live data without a connected Supabase backend.
Follow **`supabase/README.md`** for the full backend setup: creating the
Supabase project, applying the schema, setting the Anthropic API key as a
function secret, and deploying the Edge Functions.

## Tests

```bash
pnpm test                 # unit tests (Vitest): src/lib and supabase/functions
pnpm test:e2e             # browser tests (Playwright); first time: pnpm exec playwright install chromium
pnpm typecheck            # frontend types
pnpm typecheck:functions  # edge function types (Deno)
pnpm test:all             # all of the above
```

Neither suite touches the real Supabase project or makes an AI call. Unit
tests run the edge functions' code against a fake database client and a
stubbed `fetch` (`tests/unit/helpers`). Browser tests start their own dev
server on port 8444 pointed at a mock Supabase (`tests/e2e/mockBackend.ts`).

## Current status

**Working:** authentication, onboarding (persists real firm/fund/portfolio
data), the three-tab dashboard reading real relevance-filtered regulations,
per-company AI web search, flags and notes, and the RegWay AI chat with live
citations.

**Not yet built:**
- The Headline Detail View's deeper "regulatory diff" and "operational
  implications" sections are still placeholder content, not per-regulation
  AI analysis.
- Relevance matching can occasionally be too permissive on speculative
  connections and needs a stricter pass.
- Coverage is US federal only — no state law (e.g. Delaware) or non-US
  jurisdictions (EU, Cayman, etc.) yet.
- The per-company AI scan is synchronous and can take 30+ seconds on first
  click; no background pre-warming yet.
