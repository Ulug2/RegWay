# Starter backlog for the new team

Proposed on 2026-10-11 from the roadmap and a read of the code. Where a
task says "roadmap 16a", that section is now "Known defects" in the
roadmap; the original text is in `docs/archive/roadmap-history.md`. Each one becomes a GitHub Issue ("Feature or task" template) when the
owner and lead agree to it; this file can be deleted once they are filed.

**Checked** means the problem was confirmed in the code on 2026-10-11.
**To investigate** means the roadmap reports it but nobody has reproduced
it since; the first step of the task is to confirm it.

Files that several tasks touch, where the lead should let only one task run
at a time: `src/components/Dashboard.tsx` (tasks 2, 3), `src/lib/data.ts`
(3, 4), `src/components/RegWayAICopilot.tsx` (7), `src/App.tsx` (10),
`supabase/functions/_shared/regulatorFeeds.ts` (12).

## A. Small and independent (good first tasks)

### 1. FAQ page
- **Problem:** the site has About, Sources, Legal and Privacy pages but no
  FAQ (roadmap 16f). Checked: `PAGES` in `src/lib/router.ts` has no `faq`.
- **Expected result:** a public page at `/faq`, linked from the footer and
  the page navigation, in the style of the other four.
- **Done when:** `/faq` opens signed out and signed in; it is in the footer;
  a browser test in `tests/e2e/routes.spec.ts` covers it; both themes and
  phone width look right.
- **Depends on:** the owner approving the questions and answers in
  `docs/faq.md` (the ones marked "Owner to answer").
- **Difficulty:** easy. **Files:** `src/lib/router.ts`,
  `src/components/InfoPage.tsx`, `src/components/SiteFooter.tsx`.
- **New contributor:** yes.

### 2. Rename the dashboard's level buttons
Done on 2026-10-23 by the owner ("General Partners", "Funds").

### 3. Failing-source banner: grammar and which feed
Done (`src/lib/sourceNotice.ts`, `tests/unit/sourceNotice.test.ts`).

### 4. One list of source names
Done on 2026-11-21: `src/lib/sourceList.ts`, checked by `tests/unit/sourceList.test.ts`.

### 5. Old locations written with a full state name
Done (`parseLegacyLocation` reads full state names, ZIPs, D.C. and country names).

### 6. Feed summaries showing `&nbsp;` and repeated titles
Done (double-encoded text is decoded, `tests/unit/rss.test.ts`).

### 7. Empty answer bubble after stopping the chat
- **Problem (to investigate):** after pressing stop on a chat answer, an
  empty bubble stays until the next message (roadmap 16a).
- **Expected result:** a stopped answer with no text leaves no bubble; one
  with partial text keeps it.
- **Done when:** a browser test in `tests/e2e/copilot.spec.ts` covers both.
- **Depends on:** the owner's go-ahead (he is rebuilding the chat, roadmap
  item 17); only one person in `RegWayAICopilot.tsx` at a time.
- **Difficulty:** easy to medium. **New contributor:** yes.

### 8. Bring `supabase/README.md` up to date
- **Problem:** Checked: it lists 6 functions to deploy; there are 17, and it
  says `db push` applies `0001_init.sql` when there are 35 migrations.
- **Expected result:** an accurate description of every function (one line
  each) and of setup, marked clearly as owner-only.
- **Done when:** every folder in `supabase/functions/` is listed; the owner
  confirms the deploy steps.
- **Difficulty:** easy. **New contributor:** yes; a good way to learn the backend.

### 9. Phone-width and accessibility pass
- **Problem (to investigate):** the roadmap says the mobile layout of the
  newer screens "isn't visually confirmed". No accessibility review has
  been recorded.
- **Expected result:** a list of concrete findings, each filed as its own
  issue with a screenshot; no code in this task.
- **Done when:** every screen checked at 390px wide in both themes (the
  screenshots come from `CAPTURE=screens pnpm exec playwright test capture`)
  and with keyboard only.
- **Difficulty:** easy. **New contributor:** yes. Produces follow-up tasks.

## B. Medium

### 10. Split the JavaScript bundle
- **Problem:** Checked: `pnpm build` warns that a chunk is over 500 kB. A
  visitor to the landing page downloads the whole signed-in app.
- **Expected result:** the chat, profile and development screens load on
  demand (`React.lazy`).
- **Done when:** the build warning is gone or the landing page's JavaScript
  is measurably smaller (numbers in the pull request); all browser tests pass.
- **Depends on:** coordinate with anyone else changing `src/App.tsx`.
- **Difficulty:** medium. **New contributor:** after one merged task.

### 11. Demo data for local development (mostly done 2026-10-11)
- **Done:** `scripts/export-demo-firm.sh` copies the H.I.G. test firm into
  `supabase/seeds/demo-firm.sql`, loaded by every `supabase db reset`
  (`docs/local-demo-data.md`). Tested with an invented firm, local to local.
- **Left for the owner:** run it once against the hosted project and commit
  the file. **Do this before the team starts: it unblocks everyone.**
- **Left as a task (easy, after that):** a browser walk-through of a local
  database loaded with the real copy, noting anything that looks wrong
  (missing logos are expected), filed as issues.

### 12. One new regulator feed each (NFA, MSRB, PCAOB, …)
- **Problem:** roadmap 16h lists bodies that are not in the Federal Register
  and need their own feed. Checked: feeds are entries in `REGULATOR_FEEDS`
  (`supabase/functions/_shared/regulatorFeeds.ts`).
- **Expected result:** per feed: confirm a usable public feed exists (to
  investigate, some may not), add the entry, its display name, and tests.
- **Done when:** a unit test parses a saved sample of the real feed; a
  local `sync-regulator-feeds` run stores its items; the Sources page lists it.
- **Depends on:** one issue per feed; the lead orders the merges because
  they all add to the same list. Owner's review (`supabase/`). No AI cost
  to build, but each feed adds documents the matcher pays to judge: the
  owner approves each one.
- **Difficulty:** medium. **New contributor:** after one merged task.

### 13. Access-rule tests with two firms
- **Problem:** roadmap 16g.1 asks: can a user of firm A read or change firm
  B's rows? Nothing tests it.
- **Expected result:** an automated test, run against a **local** database,
  that signs in as two users of two firms and tries to read and write each
  other's rows in every per-firm table and the logo storage bucket.
- **Done when:** every table in `docs/architecture.md` is covered; failures
  are reported to the owner privately, not in a public issue; a command to
  run it is documented.
- **Depends on:** owner's go-ahead; findings go to the owner first.
- **Difficulty:** medium to hard. **New contributor:** no; a contributor
  with database experience, supervised by the lead.

### 14. Dependency audit
Done on 2026-11-21: `pnpm audit` is clean (issue #18).

## C. Stay with the owner or the lead

| Task | Why it stays | Source |
|---|---|---|
| Turn on branch protection; invite people; choose the lead | Account settings | CONTRIBUTING.md |
| Format the whole codebase once, then make formatting a required check | Checked: `oxfmt --check` fails on about 157 files. One person, one pull request, at a moment when no branches are open | this audit |
| `regulation_impacts.updated_at` | Database migration | roadmap 16a |
| Security headers (Content-Security-Policy) in `vercel.json` | Production configuration; can break the live site | roadmap 16g.6 |
| Edge Function review: session checks, open CORS, functions callable without a session | Security | roadmap 16g.2 |
| Server refuses a second analysis request while one is running | Server function + AI spend | roadmap 16a |
| What is sent to the AI provider; prompt injection | Security and contracts | roadmap 16g.5 |
| Email alerts | Needs an email provider and product decisions | roadmap 12, Phase 3 |
| Multi-role AI architecture (Orchestrator + Skeptic) | The owner is building it | roadmap 17 |
| Any prompt or model change | Cost and quality, measured on a real firm | — |
| Deploying migrations and functions | Production | — |
