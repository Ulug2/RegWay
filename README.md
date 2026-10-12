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

- **Real regulatory data** — Edge Functions pull new and proposed federal
  rules from the free, official [Federal Register API](https://www.federalregister.gov/developers/documentation/api/v1),
  plus regulator announcements, enforcement actions, sanctions and travel
  advisories from the feeds listed on the site's Sources page.
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

- **Frontend**: React 19, Vite and Tailwind CSS v4, in TypeScript. Hosted on
  Vercel at https://www.regwayai.com.
- **Backend**: [Supabase](https://supabase.com). Postgres holds the data,
  with Row Level Security (database rules that let a signed-in user read
  only their own firm's rows). Supabase Auth handles sign-up and sign-in.
  Edge Functions (small server programs, written for Deno) do everything
  that needs a secret key or an outside service.
- **AI**: the [Anthropic Claude API](https://docs.anthropic.com), called only
  from Edge Functions. The API key never reaches the browser.
- **Scheduled jobs**: `pg_cron` inside the database calls the sync and
  matching functions on a timer.

How the parts fit together: [`docs/architecture.md`](docs/architecture.md).

## Project structure

```
src/
  App.tsx            Decides which screen shows (src/lib/router.ts)
  components/        Screens and UI parts
  lib/               Supabase client, data access (data.ts), function
                     caller (functions.ts), pure logic
  index.css          Tailwind import, colours, shared classes (see DESIGN.md)
supabase/
  migrations/        Database structure and access rules, in numbered order
  functions/         Edge Functions; _shared/ is code they have in common
  seed.sql           Local databases only: switches off the scheduled jobs
  seeds/             Local databases only: the demo firm (docs/local-demo-data.md)
scripts/             Owner's export script for the demo firm
  README.md          Setting up a hosted Supabase project (owner only)
tests/
  unit/              Vitest: src/lib and the functions' logic
  e2e/               Playwright: the app in a browser against a mock backend
plans/               The roadmap: what is still to do
docs/                onboarding.md (start here), architecture.md, guides
  product/           Product documents (features, onboarding questions)
  notes/             Investigation and implementation notes per feature
  archive/           Finished roadmap entries, with how each was verified
  brand/             Logo source files
```

## Getting started

New here? Follow [`docs/onboarding.md`](docs/onboarding.md) step by step, then
read [`CONTRIBUTING.md`](CONTRIBUTING.md) before your first change.

You need Node 22, pnpm 10 (versions in `.mise.toml`), Docker Desktop and the
[Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).
The short version:

```bash
pnpm install
supabase start               # your own local database: all tables, plus the demo firm
cp .env.example .env.local   # then paste the anon key from `supabase status`
pnpm dev                     # http://localhost:8443
```

Everyone develops against their **own local database**. Nobody but the owner
has the hosted project's keys, and nothing in day-to-day work needs them.

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

## Checks

```bash
pnpm test:all   # types, function types, unit tests, browser tests
pnpm build      # production build
```

GitHub runs the same checks on every pull request
(`.github/workflows/ci.yml`). `pnpm format` (oxfmt) exists, but the code has
not been formatted with it as a whole, so it is not a required check: do not
run it across the repository in a feature branch.

## Deployment

Done by the owner only. The frontend is on Vercel. Database migrations
(`supabase db push`) and Edge Functions (`supabase functions deploy`) are
applied to the hosted Supabase project by hand with the Supabase CLI; merging
a pull request does not deploy them.

## Status and roadmap

What is still to do: [`plans/regway-mvp-roadmap.md`](plans/regway-mvp-roadmap.md).
What was built and how it was verified:
[`docs/archive/roadmap-history.md`](docs/archive/roadmap-history.md). Tasks
being worked on are GitHub Issues.
