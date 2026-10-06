# Next session — starting prompt

Last updated 2026-10-06 (end of the cloud session). All work is on branch
`claude/eager-maxwell-1oqaw3`, 11 commits ahead of `main` (a fast-forward:
`main` has nothing the branch lacks). Production (Supabase project
`cfspwaqtidfliupmlfwz`) matches the branch on the server side: migrations
0024–0030 applied, every edge function deployed.

**Frontend not yet redeployed.** Everything user-facing since commit
`69ce235` goes live with the next frontend deploy: sticky AI input, password
flows, chat limits and fixes, chat sidebar + focus switching, fund / company
pages, day-by-day lists, the landing page with in-place sign-in and scroll
animations, and the profile-edit re-discovery trigger.

## Setting up on the Mac

- Bring `main` up to date with the branch (fast-forward), then work on `main`:
  `git fetch origin && git checkout main && git merge --ff-only origin/claude/eager-maxwell-1oqaw3 && git push origin main`
  (or keep working on the branch: `git checkout claude/eager-maxwell-1oqaw3 && git pull`).
- `pnpm install`; `.env.local` (gitignored) with `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` (the publishable key); `pnpm dev`.
- Deploys / SQL: `SUPABASE_ACCESS_TOKEN` set, `supabase` CLI, then
  `supabase functions deploy --project-ref cfspwaqtidfliupmlfwz --use-api`.
- Checks: `pnpm test:all` (type-checks, 267 unit tests, 78 browser tests;
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
- **AI spend** since 2026-10-05: about $5.
- **Waiting on the owner:**
  - Roadmap item 11 (re-discovery after profile edits) is built and
    deployed but not run live: a reversible strategy edit on H.I.G. would
    forget and re-judge ~239 rejection markers (≈ $0.25 + analyses).
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
since 2026-10-06 in `usage_events`, then continue with the roadmap's
Priority order (next: item 12's remaining work, then 13). Run
`pnpm test:all` before and after each change and add tests for what you
build. Deploy and test against the live project; tell me before anything
that deletes or overwrites production data beyond test rows you created.

---
