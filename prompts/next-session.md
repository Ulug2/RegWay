# Next session — starting prompt

Last updated 2026-10-05 (US Eastern; 2026-10-06 UTC). Local `main` holds
all work: the 12 commits from branch `claude/eager-maxwell-1oqaw3`
(fast-forwarded) plus the uncommitted fixes for roadmap item 11a. `main` is
not pushed yet. Production (Supabase project `cfspwaqtidfliupmlfwz`) matches
it on the server side: migrations 0024–0030 applied, every edge function
deployed (`match-relevance`, `match-enforcement-relevance` and
`regway-ai-chat` again for 11a).

**Frontend not yet redeployed.** The site is https://reg-way.vercel.app
(build of 2026-10-05 02:28 UTC: it has the sticky AI input and the password
flows). Everything after that goes live with the next frontend deploy: chat
sidebar + focus switching, fund / company pages, day-by-day lists, the
landing page with in-place sign-in and scroll animations, the profile-edit
re-discovery trigger, and the 11a fixes. Next: item 11b, the move to
`regwayai.com`.

## Setting up on the Mac

- Work on `main` (already fast-forwarded to the branch on the Mac); commit
  the 11a changes and `git push origin main` when the owner says so.
- `pnpm install`; `.env.local` (gitignored) with `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` (the publishable key); `pnpm dev`.
- Deploys / SQL: `SUPABASE_ACCESS_TOKEN` set, `supabase` CLI, then
  `supabase functions deploy --project-ref cfspwaqtidfliupmlfwz --use-api`.
- Checks: `pnpm test:all` (type-checks, 274 unit tests, 84 browser tests;
  first time `pnpm exec playwright install chromium`).

## State at hand-off

- **Primary test account: H.I.G. Capital** (firm `b3eb450e-1edf-4de6-94c9-9d18a48f14f2`).
  Other firms are ignored for testing.
- **Scheduled matching** runs for H.I.G. only (`scheduled_matching_firms`,
  cron `run-matching-30min`); H.I.G.'s backlog is clear and runs since are
  no-ops. Check: `select * from sync_runs where source = 'matching' order by ran_at desc`.
- **Models:** regulatory matcher on Claude Haiku 4.5; geopolitical and
  enforcement matchers, analyses, chat and scans on Sonnet 4.5; every
  verdict call at temperature 0. `usage.ts` prices per model.
- **AI spend** on 2026-10-05 (UTC): about $5; all time: about $13.5.
- **Waiting on the owner:**
  - H.I.G.'s firm strategies still include "Venture Capital", added for
    the live re-discovery test on 2026-10-05 (it worked; see roadmap item
    11a). The owner removes it in Settings → Firm; that save runs one more
    re-check.
  - Commit and push `main` (deploys the website if Vercel builds from it).
  - Footer links (About Us, Sources, Legal, Privacy) need page content.
- **Live AI tests still owed:** see that table in
  `plans/regway-mvp-roadmap.md` (pre-publication analysis; fund-level
  matches once H.I.G. holdings are recorded).
- Notes for the latest passes: `prompts/rediscovery-after-edits.md`,
  `prompts/landing-page-motion.md`, `prompts/entity-pages-days.md`,
  `prompts/chat-scope-sidebar.md`, `prompts/model-compare-haiku.md`.

## Prompt to paste

---

Read CLAUDE.md, plans/regway-mvp-roadmap.md and prompts/next-session.md.
Keep using the audit → implement flow, save each pass's prompt under
prompts/, and keep code clean and scalable. Test only on the H.I.G. Capital
account. Check the last few `matching` rows in `sync_runs` and the AI spend
since 2026-10-06 (UTC) in `usage_events`, then continue with the roadmap's
Priority order (next: item 11b, then item 12's remaining work, then 13). Run
`pnpm test:all` before and after each change and add tests for what you
build. Deploy and test against the live project; tell me before anything
that deletes or overwrites production data beyond test rows you created.

---
