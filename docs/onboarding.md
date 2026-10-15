# Welcome to RegWay

Read this once, top to bottom, before you write any code. It takes you from
nothing to a merged pull request: what the product is, how the team works,
how the code is put together, and how to set up your laptop with your own
copy of the database and the H.I.G. test account in it.

If a step fails, say so in the team chat straight away. The next person
will hit the same thing, and your first pull request can be the fix.

**Contents**
1. [What RegWay is](#1-what-regway-is)
2. [How the team works](#2-how-the-team-works)
3. [How the code is put together](#3-how-the-code-is-put-together)
4. [Set up your laptop](#4-set-up-your-laptop)
5. [Your local database and the H.I.G. test account](#5-your-local-database-and-the-hig-test-account)
6. [Run the app](#6-run-the-app)
7. [Using the AI](#7-using-the-ai)
8. [Run the checks](#8-run-the-checks)
9. [Your first pull request](#9-your-first-pull-request)
10. [Every task after that](#10-every-task-after-that)
11. [Rules that are not negotiable](#11-rules-that-are-not-negotiable)
12. [When something goes wrong](#12-when-something-goes-wrong)

---

## 1. What RegWay is

A private equity firm owns companies through funds. New rules, enforcement
actions and sanctions are published every day, and almost none of them
matter to any one firm. RegWay reads the public sources, and for each firm
shows only what applies to that firm, one of its funds, or one of its
portfolio companies, with the reason and a written analysis. A chat
("RegWay AI") answers questions about the firm's own situation with sources.

The live site is https://www.regwayai.com. The account we test on is
**H.I.G. Capital**: a real firm's public facts, plus a few invented funds
and companies whose names end in "(test)".

## 2. How the team works

| Who | Does what |
|---|---|
| **Ulugbek** (owner, `@Ulug2`) | Decides what gets built. Each week picks the team's tasks from the roadmap. Reviews anything touching the database, sign-in, server functions or AI. The only person with production access; does all deployments. Currently building the multi-role AI (roadmap item 17). |
| **Aadit** (team lead) | Turns the week's tasks into GitHub Issues, assigns each to one person, answers questions, reviews pull requests and merges them. Your first contact for everything. |
| **You** (contributor) | Own the issues assigned to you from start to merge. Keep pull requests small. Say early when you are stuck. |

**The weekly cycle**

1. Ulugbek chooses the week's tasks from `plans/regway-mvp-roadmap.md`.
2. Aadit writes each as a GitHub Issue with a "Done when" list and assigns it.
3. You do the work on a branch on your laptop and open a pull request.
4. GitHub runs the automatic checks. Aadit reviews. If your change touches
   a sensitive area, GitHub also asks Ulugbek.
5. Aadit merges. Ulugbek deploys.

**Where things are said**

- The work itself, and any technical decision: on the GitHub Issue or pull
  request. If something was decided in chat, write the outcome on the issue.
- Quick questions, "I'm stuck", announcements: the team chat.
- Stuck for an hour: ask. Blocked for a day: tell Aadit.

## 3. How the code is put together

The longer version, with the tables and every function, is
[`architecture.md`](architecture.md). What you need on day one:

```
 Browser: the React app (src/)
    │  reads and writes its own firm's rows         calls server functions
    ▼                                                     │
 Postgres database  ◄──────── Edge Functions (supabase/functions/) ──► Claude (AI)
 (supabase/migrations/)             ▲                                  public sources
    └── timers inside the database call the sync and matching functions
```

- **Frontend** (`src/`): React 19, TypeScript, Vite, Tailwind CSS. Runs in
  the browser. `src/App.tsx` picks the screen; `src/components/` holds the
  screens; `src/lib/data.ts` talks to the database; `src/lib/functions.ts`
  calls the server functions. How the interface must look: `DESIGN.md`.
- **Database** (`supabase/migrations/`): Postgres, hosted by Supabase. The
  numbered SQL files are the database's structure. Each table has **Row
  Level Security**: rules in the database that let a signed-in user read
  and change only their own firm's rows.
- **Edge Functions** (`supabase/functions/`): small server programs, one
  folder each, written for Deno (a JavaScript runtime like Node). Anything
  that needs a secret key or calls an outside service lives here: pulling
  documents from regulators, asking the AI, writing analyses.
- **Timers**: the database itself calls the sync and matching functions
  every 30 minutes or so.
- **Tests** (`tests/`): unit tests (Vitest) for logic, browser tests
  (Playwright) for what a user sees. They use a fake database and a fake
  AI, so they never touch anything real.

**The one idea to remember:** the app never lists the `regulations` table
directly. A document appears for a firm only after a matcher has judged
that it applies and stored a row in `regulation_relevance`. So the path of
every item on screen is: *sync* (fetch the document) → *match* (the AI
decides whether it applies to this firm) → *analyse* (the AI writes what it
means) → *show*.

**Where to look for what**

| You want to change… | Look in |
|---|---|
| A screen, a button, wording | `src/components/` |
| How data is loaded or saved | `src/lib/data.ts` |
| A calculation or filter | `src/lib/` (and its test in `tests/unit/`) |
| Colours, spacing, shared styles | `src/index.css`, after reading `DESIGN.md` |
| A source we pull documents from | `supabase/functions/sync-*`, `_shared/regulatorFeeds.ts` |
| A table or an access rule | a **new** file in `supabase/migrations/` (ask first) |
| What the AI is asked | Ask Ulugbek first. He is rebuilding this (item 17). |

## 4. Set up your laptop

These steps were tested on a Mac. On Windows, use WSL2 (Ubuntu) and follow
the Linux instructions of each tool; nobody on the team has tested that
yet, so note what you had to change.

### 4.1 GitHub

- [ ] Send Ulugbek your GitHub username.
- [ ] Accept the invitation: https://github.com/Ulug2/RegWay/invitations
- [ ] Turn on two-factor sign-in: GitHub → Settings → Password and
      authentication.

### 4.2 Tools

- [ ] **Git.**
- [ ] **Node 22 and pnpm 10.** pnpm is the package manager (like npm). The
      exact versions are in `.mise.toml`. Easiest: install
      [mise](https://mise.jdx.dev), then run `mise install` inside the
      project. Or install Node 22 yourself and run `npm install -g pnpm@10`.
- [ ] **Docker Desktop**, installed and *running* (the whale icon in the
      menu bar). Your local database runs inside it.
- [ ] **Supabase CLI**: `brew install supabase/tap/supabase` on a Mac;
      [other systems](https://supabase.com/docs/guides/local-development/cli/getting-started).
- [ ] An editor. VS Code is fine.

Check them:

```bash
node -v        # v22.x
pnpm -v        # 10.x
docker info    # prints details, not an error
supabase -v
```

### 4.3 Get the code

```bash
git clone https://github.com/Ulug2/RegWay.git
cd RegWay
pnpm install
pnpm exec playwright install chromium   # the browser the tests drive
```

`pnpm install` also installs Deno, which type-checks the server functions.
You do not install Deno yourself.

## 5. Your local database and the H.I.G. test account

You get your **own** database, on your laptop. It has the same tables as
production and a copy of the H.I.G. test firm. You can break it and rebuild
it in a minute, and nothing you do in it can reach real users.

```bash
supabase start
```

The first run downloads Docker images and takes a few minutes. What it does:

1. Creates an empty Postgres database on your machine.
2. Runs every file in `supabase/migrations/` in order. That builds the
   tables and access rules, exactly as production has them.
3. Runs `supabase/seed.sql`, which switches off the timers (in production
   they call the real server functions; a laptop must not).
4. Runs `supabase/seeds/demo-firm.sql`, which loads the H.I.G. test firm:
   its profile, funds, companies, the developments matched to it with
   their reasons and analyses, and a sign-in for you:

   **Email `demo@regway.local`, password `regway-demo-local`**

   That account exists only in local databases. No real account, chat
   history or key is in the file. Details: [`local-demo-data.md`](local-demo-data.md).

- [ ] `supabase start` finished without an error.

**Do not run `supabase login`, `supabase link` or `supabase db push`.**
Those connect the tool to the production project. Only Ulugbek does that.

Things you will use:

| What | How |
|---|---|
| Look at the tables, edit rows | http://127.0.0.1:54323 |
| Rebuild the database from scratch (after pulling new migrations or new demo data, or when you have made a mess) | `supabase db reset` |
| Stop it at the end of the day | `supabase stop` |
| Start it again | `supabase start` |
| See emails the app "sent" (nothing is really sent) | http://127.0.0.1:54324 |

### Connect the app to your database

```bash
cp .env.example .env.local
supabase status -o env | grep -E '^(API_URL|ANON_KEY)='
```

- [ ] Open `.env.local` and set `VITE_SUPABASE_URL` to the `API_URL` value
      and `VITE_SUPABASE_ANON_KEY` to the `ANON_KEY` value (without the
      quotes).

`.env.local` is ignored by git. It holds exactly these two values, both for
your local database.

## 6. Run the app

```bash
pnpm dev
```

- [ ] Open http://localhost:8443. You see the landing page.
- [ ] Sign in as `demo@regway.local` / `regway-demo-local`. You see H.I.G.'s
      dashboard with developments on it.
- [ ] Click through: a development, a fund, a portfolio company, Profile.

If the sign-in is refused, the demo data has not been added to the
repository yet. Ask Aadit; meanwhile you can sign up with any made-up email
and go through onboarding with an invented firm (its dashboard will be
empty).

What works locally without an AI key: browsing everything, reading the
stored analyses, editing the profile, flags, notes, dismissing items,
signing up more users. What shows an error: anything that asks the AI (next
section). That is expected.

## 7. Using the AI

Most tasks never need a real AI call. The tests replace the AI with a fake
one, so you can change and test code around the AI without a key. You need
a key only when your task is to see a real answer: a match, an analysis, a
company scan or a chat reply.

**Every call costs real money**, charged to RegWay:

| Action | About |
|---|---|
| Chat message | $0.06 |
| Impact analysis (opening a development that has none) | $0.06, up to $0.22 |
| Matching a batch of 40 documents | $0.05 |
| Company scan (it searches the web) | $0.20, plus the analyses it sets off |

**Getting a key**

1. Ask Ulugbek (through Aadit) and say which issue needs it. He creates a
   development key with a spending limit and sends it to you privately.
2. It is yours alone. Do not pass it on; if a teammate needs one, they ask.

**Using it**

1. Create the file `supabase/functions/.env` (it is ignored by git) with
   one line:

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

2. Start the server functions in their own terminal and leave it running:

   ```bash
   supabase functions serve
   ```

3. Use the app at http://localhost:8443 as normal. The chat, analyses,
   company scans and matching now reach the AI.

If you get `Anthropic API error: 401 … invalid x-api-key`, the key is
wrong or was switched off. Any other time you see an AI error with no key
file, that is the expected local behaviour.

**Rules for the key**

- It goes in `supabase/functions/.env` and nowhere else. Never in
  `.env.local`, never in code, a test, an issue, a pull request or chat.
- Never in a variable whose name starts with `VITE_`: those are built into
  the web page, where anyone can read them.
- Do not put it in CI. Tests must pass without it.
- Do not run loops or scripts that call the AI repeatedly. Try one call,
  look at the result, then decide.
- A company scan runs by itself when a company is new or its details
  change. With a key in place, adding five companies costs a dollar.
- Opening the dashboard asks the geopolitical matcher to check for new
  items. Without a key you will see that request fail (a 500 from
  `match-geopolitical-relevance` in the browser's network tab); ignore it.
  With a key it can spend a few cents when there is something new to judge.
- Finished the task? Delete the file and tell Ulugbek so he can switch the key
  off.
- Leaked it (pushed it, pasted it somewhere)? Tell Ulugbek immediately. It
  takes him one minute to replace it and it is not a big deal if you say
  so at once.

**Pulling fresh documents (free, no key)**

With `supabase functions serve` running, this fetches the last week of
Federal Register documents into your local database:

```bash
eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY)=')"
curl -X POST "$API_URL/functions/v1/sync-federal-register" \
  -H "Authorization: Bearer $ANON_KEY" -H 'Content-Type: application/json' -d '{}'
```

They show in the `regulations` table, not on the dashboard: nothing has
matched them to a firm yet, and matching is an AI call.

## 8. Run the checks

```bash
pnpm test:all
```

It runs four things, in order:

| Command | What it checks |
|---|---|
| `pnpm typecheck` | Types in the frontend |
| `pnpm typecheck:functions` | Types in the server functions |
| `pnpm test` | Unit tests (a few seconds) |
| `pnpm test:e2e` | Browser tests (a minute or two) |

The tests start their own copy of the app on port 8444 against a fake
backend. They pass whether or not your database is running, and they do
not touch it.

- [ ] Everything passes before you have changed anything. If not, report
      it. Do not work around it.

## 9. Your first pull request

Everyone's first task is the same: improve this document. It proves your
setup works and walks you through the whole flow once.

```bash
git checkout main
git pull
git checkout -b docs/onboarding-<your-first-name>
```

- [ ] Fix one thing in this file that was unclear, wrong or missing when
      you followed it. If truly nothing was, add a line under
      [Notes from new contributors](#notes-from-new-contributors) with your
      operating system and "every step worked".

```bash
git add docs/onboarding.md
git commit -m "Onboarding: <what you fixed>"
git push -u origin HEAD
```

- [ ] Open the link git prints. Fill in the pull request template.
- [ ] Wait for the checks to go green: "Types, unit tests, build" (about
      a minute) and "Browser tests" (a few minutes; it shows as skipped when
      the pull request changes nothing that runs in the browser, such as
      this one).
- [ ] Ask Aadit for a review in the team chat.
- [ ] If GitHub says your branch has conflicts (several people edit this
      file in the same week), see "Keeping your branch up to date" in
      `CONTRIBUTING.md`. It is good practice.

## 10. Every task after that

1. **Open your issue.** Read the "Done when" list. If anything is unclear,
   ask on the issue before writing code.
2. **Branch** from a fresh `main`: `feature/…`, `fix/…` or `docs/…`.
3. **Read before you write**: the files the issue names, their tests, and
   `DESIGN.md` if it is a screen.
4. **Make the change, with a test.** Logic gets a unit test in
   `tests/unit/`; something a user sees gets a browser test in `tests/e2e/`.
5. **Run `pnpm test:all`.**
6. **Open a pull request** early (as a draft if it is not finished). Write
   "Closes #<issue number>" in the description. Add screenshots for
   anything visible: light, dark, and phone width.
7. **Answer the review** with new commits, not a rewritten history.
8. **Aadit merges.** Delete your branch. Pull `main` before the next task.

The full rules (branch names, commit messages, database changes, what needs
Ulugbek's review) are in [`CONTRIBUTING.md`](../CONTRIBUTING.md). Read it
before your second pull request.

Using an AI coding assistant is fine. You answer for every line you
submit: read it, run it, and be able to explain it in review.

## 11. Rules that are not negotiable

- **Never push to `main`.** Everything goes through a pull request.
- **Never commit a key, password, token or `.env` file.**
- **Never ask for or use production credentials.** Not the Supabase service
  key, not the database password, not the production AI key, not the real
  H.I.G. sign-in. If a task seems to need them, it is Ulugbek's task.
- **Never edit an existing migration.** Add a new numbered one, and talk to
  Aadit first. The automatic checks reject an edited migration.
- **Never run `supabase link`, `supabase login` or `supabase db push`.**
- **No test may call a real service.**
- **Do not change the AI's prompts, models or the chat function** without
  Ulugbek's say-so: he is rebuilding them.
- **Found a security problem?** Tell Ulugbek privately. Do not open an issue.

## 12. When something goes wrong

| Symptom | Try |
|---|---|
| `supabase start`: "Cannot connect to the Docker daemon" | Start Docker Desktop and wait until it says it is running |
| `supabase start`: a port is already in use | Another Supabase project is running: `supabase stop --all`, then start again |
| The page is blank, console says "Missing VITE_SUPABASE_URL" | `.env.local` is missing or empty; redo "Connect the app to your database", then restart `pnpm dev` |
| Sign-in as the demo user is refused | `ls supabase/seeds/demo-firm.sql`. Missing: ask Aadit. Present: `supabase db reset` |
| The dashboard shows nothing for today | `supabase db reset` (the demo data is dated relative to when it was loaded) |
| `pnpm dev`: port 8443 in use | Another copy is running; close it, or `PORT=8450 pnpm dev` |
| Browser tests fail with "Executable doesn't exist" | `pnpm exec playwright install chromium` |
| A check fails on GitHub but passes for you | Read the log on GitHub first. Usually `main` moved: merge it into your branch |
| After `git pull`, the app errors on a missing column | A new migration arrived: `supabase db reset` |
| Anything else, after an hour | Team chat, with the command you ran and the full error |

## Notes from new contributors

<!-- Add a line here in your first pull request. -->
