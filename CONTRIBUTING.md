# Contributing to RegWay

How work gets from an idea to the main branch. Set up your machine first
with [`docs/onboarding.md`](docs/onboarding.md).

## The short version

1. Pick an issue that is assigned to you (or ask the lead for one).
2. Make a branch from an up-to-date `main`.
3. Make the change, with a test. Run `pnpm test:all`.
4. Open a pull request. Fill in the template.
5. The checks go green, a reviewer approves, the lead merges.

Nobody pushes to `main` directly, the owner and the lead included.

The roadmap (`plans/regway-mvp-roadmap.md`) lists what is open. A pull
request that finishes an item removes it there and adds a short entry at
the top of `docs/archive/roadmap-history.md`.

## Who does what

- **Owner (Ulug, @Ulug2)**: decides what the product does and picks each
  week's tasks from the roadmap; has the final say on architecture,
  security, the database, releases and anything that touches production.
  The only person with production keys.
- **Team lead (Aadit)**: turns the week's tasks into issues, assigns each
  to one person, reviews pull requests (or names a reviewer) and merges
  them, unblocks people, and tells the owner each week what moved and what
  is at risk.
- **Contributors**: own the issues assigned to them from start to merge,
  keep pull requests small, say early when stuck, and write down anything
  the next person needs to know.

## Issues

Work that is not in an issue does not exist. Before starting:

- The issue has a "Done when" list. If it does not, ask before writing code.
- It is assigned to you. One person per issue.
- If it needs a decision from the owner, it has the `needs-owner` label and
  you wait for the answer.

Found a bug while doing something else? Open a new issue; do not fix it in
the same pull request.

## Branches

Branch from `main`, named `<kind>/<short-description>`:

```
feature/faq-page
fix/failing-source-banner-wording
docs/onboarding-windows-notes
chore/ci-cache
```

```bash
git checkout main
git pull
git checkout -b feature/faq-page
```

### Keeping your branch up to date

When `main` has moved on, or GitHub reports a conflict:

```bash
git checkout main && git pull
git checkout feature/faq-page
git merge main            # fix any conflicts, then: git add -A && git commit
pnpm test:all
git push
```

Do not force-push (`git push --force`) a branch someone is reviewing.

## Commits

Write what changed, in plain words, the way the existing history does
(`git log --oneline`): "Federal Register: 43 more agencies from the source
registry", not "updates" or "fix stuff".

## Checks before you open a pull request

```bash
pnpm test:all   # types, function types, unit tests, browser tests
pnpm build      # only if you touched the build, index.html or dependencies
```

GitHub runs the same checks on every pull request. A red check blocks the
merge. If a check fails on GitHub but passes for you, read the log before
re-running it.

Tests are part of the change:

- Logic in `src/lib/` or `supabase/functions/` gets a unit test in
  `tests/unit/` (helpers there provide a fake database and a fake AI).
- Something a user sees or clicks gets a browser test in `tests/e2e/`
  (against the mock backend in `tests/e2e/mockBackend.ts`).
- No test may call the hosted Supabase project or the Anthropic API.

Screen changes follow [`DESIGN.md`](DESIGN.md): shared classes from
`src/index.css`, icons from `src/components/icons.ts`, both themes, and a
phone width.

Do not run `pnpm format` over the whole repository: the code was not
formatted with it, so it rewrites about 150 files and buries your change.

## Pull requests

- **Small.** One issue, one pull request, ideally under about 300 changed
  lines. A big feature is several pull requests.
- **Draft early** if you want feedback before it is finished.
- **Say how you checked it.** Screenshots for anything visible.
- **Respond to review** with a new commit, not a rewritten history.
- **The lead merges**, using "Squash and merge", once the checks are green
  and the review is approved. Delete the branch after.

Reviews: the lead reviews, or names another contributor. The author never
approves their own pull request. Aim to give a first review within one
working day.

## Changes that need the owner

Listed in [`.github/CODEOWNERS`](.github/CODEOWNERS); GitHub asks the owner
for a review automatically. Talk to the owner or lead **before** starting
one of these, not after:

| Area | Why |
|---|---|
| `supabase/migrations/` | The database structure and the rules for who can read what. A mistake can expose one firm's data to another or lose data. |
| `supabase/functions/` | Server code that holds the service key (which bypasses the access rules) and spends AI credit on every call. |
| Sign-in, sign-up, password reset | Account security. |
| AI prompts, models, or how often the AI is called | Cost and answer quality; both are measured against a real firm. The owner is rebuilding the chat and the matchers' judges (roadmap item 17): do not change `regway-ai-chat`, `_shared/regulatoryJudge.ts`, `_shared/geopoliticalJudge.ts`, `_shared/impact.ts` or `rematch-regulation` without asking. |
| `package.json` | Every new dependency is someone else's code running in our product. Say why it is needed. |
| `.github/`, `vercel.json`, agent instructions (`AGENTS.md`, `.claude/`, `.mcp.json`) | CI, deployment, and tools that run with a developer's permissions. |

### Database changes

- **Never edit, rename or delete an existing migration.** It has already
  been applied to the hosted database; changing the file changes nothing
  there and breaks everyone's fresh local database. CI rejects it.
- To change the database, add the next numbered file
  (`supabase/migrations/0036_what_it_does.sql`). Two people adding 0036 at
  once is a conflict the lead sorts out: say in the issue that you are
  taking a number.
- Every new table gets Row Level Security in the same migration. Read
  `.agents/skills/supabase-postgres-best-practices/` first.
- Test it locally with `supabase db reset` (rebuilds your database from all
  migrations).
- The owner applies migrations to the hosted project after the merge.
  Contributors never run `supabase db push` or `supabase link`.

## Secrets and data

- Never commit keys, passwords, tokens, `.env` files, or a URL with a
  secret in it. `.env*` is ignored by git; keep it that way.
- Only two values belong in `.env.local`, both for your local database.
- A development AI key, if the owner gave you one, goes in
  `supabase/functions/.env` and nowhere else (`docs/onboarding.md`,
  "Using the AI").
- Do not paste secrets or real firm data into issues, pull requests, chat,
  or an AI tool.
- Committed a secret by accident? Tell the owner at once, even if you
  removed it in the next commit: it stays in the history and the key must be
  replaced.
- Found a security problem? Tell the owner privately. Do not open an issue.

## Using AI coding tools

Allowed. You are responsible for every line you submit, whoever wrote it:
read it, run it, and be able to explain it in review. `AGENTS.md` and
`DESIGN.md` are the instructions agents in this repository follow. Do not
connect an agent to the hosted Supabase project (the address in `.mcp.json`
is the owner's).

## Where to talk

- **GitHub Issues and pull requests**: the work itself, and any technical
  decision. If it was decided in chat, write the outcome on the issue.
- **Team chat**: quick questions, "I'm stuck", announcements.
- **Repository docs** (`docs/`, `plans/`, `DESIGN.md`): what stays true.

Stuck for more than an hour? Ask. Blocked for more than a day? Tell the lead.

## For the owner: branch protection

Settings → Branches → Add branch ruleset (or "Add classic branch protection
rule") for `main`:

- Require a pull request before merging, with **1** approval
- Require review from Code Owners
- Dismiss stale approvals when new commits are pushed
- Require status checks to pass, and require branches to be up to date:
  **Types, unit tests, build** and **Browser tests**
- Require conversation resolution before merging
- Block force pushes; do not allow deletions
