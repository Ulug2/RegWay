# Onboarding checklist

For a new contributor. Work through it in order; it ends with a small test
pull request. If a step fails, say so in the team channel straight away:
the next person will hit the same thing.

You will never need, and must never ask a teammate for: the hosted Supabase
project's service key or database password, the production Anthropic key,
or anyone's `.env.local`. Everything below runs on your own machine.

## 1. GitHub access

- [ ] Send the owner your GitHub username.
- [ ] Accept the invitation (email, or https://github.com/Ulug2/RegWay/invitations).
- [ ] Turn on two-factor sign-in for your GitHub account (Settings →
      Password and authentication).

## 2. Install the tools

- [ ] **Node 22** and **pnpm 10** (exact versions are in `.mise.toml`; with
      [mise](https://mise.jdx.dev) installed, `mise install` gets both).
      Otherwise install Node 22 and run `npm install -g pnpm@10`.
- [ ] **Docker Desktop**, running. The local database runs in it.
- [ ] **Supabase CLI**: `brew install supabase/tap/supabase` on a Mac;
      [other systems](https://supabase.com/docs/guides/local-development/cli/getting-started).
- [ ] Git, and an editor.

Deno (used to type-check the server functions) is installed by `pnpm
install`; you do not install it yourself.

## 3. Clone and install

```bash
git clone https://github.com/Ulug2/RegWay.git
cd RegWay
pnpm install
pnpm exec playwright install chromium   # the browser the tests drive
```

## 4. Start your own database

```bash
supabase start
```

The first run downloads several Docker images and takes a few minutes. It
creates an empty database on your machine and applies every migration in
`supabase/migrations/`, then `supabase/seed.sql`, which switches off the
scheduled jobs (the migrations point those at the hosted project).

You do **not** run `supabase login` or `supabase link`. Those connect the
CLI to the hosted project, which only the owner does.

- [ ] `supabase start` finished without an error.

## 5. Local environment variables

```bash
cp .env.example .env.local
supabase status -o env | grep -E '^(API_URL|ANON_KEY)='
```

- [ ] In `.env.local`, set `VITE_SUPABASE_URL` to the `API_URL` value and
      `VITE_SUPABASE_ANON_KEY` to the `ANON_KEY` value.

`.env.local` is ignored by git. Never commit it, paste it in chat, or put it
in an issue.

## 6. Run the app

```bash
pnpm dev
```

- [ ] Open http://localhost:8443 and see the landing page.
- [ ] Sign up with any email and a password (a made-up address is fine: the
      local database sends no real email; mail it would have sent is at
      http://127.0.0.1:54324).

Useful while developing:

- The database, as tables you can browse and edit: http://127.0.0.1:54323
- Start over with an empty database: `supabase db reset`
- Stop the database when you are done for the day: `supabase stop`

### Getting data into your local database (optional)

A fresh local database has no regulations in it. The server functions run
locally too:

```bash
supabase functions serve          # leave running in its own terminal
```

Then, in another terminal, pull the last week of Federal Register documents
(free, no AI involved):

```bash
eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY)=')"
curl -X POST "$API_URL/functions/v1/sync-federal-register" \
  -H "Authorization: Bearer $ANON_KEY" -H 'Content-Type: application/json' -d '{}'
```

What still will not work without an AI key: matching documents to a firm,
impact analyses, company scans and the chat. They call Anthropic and cost
money per call. Most tasks do not need them, because the tests cover that
code with a fake AI. If your task does, ask the owner for a development key
and put it in `supabase/functions/.env` as `ANTHROPIC_API_KEY=...` (that
file is ignored by git too).

## 7. Run the checks

```bash
pnpm test:all
```

That runs, in order: `pnpm typecheck` (frontend types), `pnpm
typecheck:functions` (server function types), `pnpm test` (unit tests) and
`pnpm test:e2e` (browser tests). The tests start their own app on port 8444
against a mock backend, so they pass with or without your local database.

- [ ] Everything passes before you change anything. If it does not, report
      it; do not work around it.

## 8. Your first pull request

- [ ] Read `CONTRIBUTING.md`.
- [ ] Make a branch: `git checkout -b docs/add-<your-first-name>-onboarding-note`
- [ ] Make one small real improvement to this file: something that was
      unclear or wrong when you followed it. (If nothing was, say which
      operating system you used and that every step worked, under "Notes
      from new contributors" below.)
- [ ] Commit, push, and open a pull request: `git push -u origin HEAD`, then
      follow the link git prints.
- [ ] Fill in the pull request template, wait for the checks to go green,
      and ask the team lead for a review.

Several people add a line to the same place, so GitHub may say your branch
has a conflict once someone else's is merged. That is expected, and good
practice: see "Keeping your branch up to date" in `CONTRIBUTING.md`.

## Notes from new contributors

<!-- Add a line here in your first pull request. -->
