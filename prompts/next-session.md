# Next session — starting prompt

Last updated 2026-10-04 (after the local test pass). Everything is merged
into `main`; production (Supabase project
`cfspwaqtidfliupmlfwz`) matches it: migrations 0024–0029 applied, every
edge function deployed.

**Frontend not yet redeployed:** the fixes and features since commit
`69ce235` (sticky AI input, password flows, chat limits, markdown link fix,
dismiss fix) go live with the next frontend deploy. Edge functions are
current as of commit `a2eb75e`.

## Setting up on a new machine

- `git fetch origin && git checkout main && git pull`
- `pnpm install`; create `.env.local` (gitignored) with `VITE_SUPABASE_URL`
  and `VITE_SUPABASE_ANON_KEY` (the publishable key), then `pnpm dev`.
- For deploys / SQL: `SUPABASE_ACCESS_TOKEN` set, `supabase` CLI, then
  `supabase functions deploy --project-ref cfspwaqtidfliupmlfwz --use-api`.
  Function type-check: `cd supabase/functions && DENO_NO_PACKAGE_JSON=1 deno check */index.ts`;
  frontend: `pnpm exec tsc --noEmit`. All checks and tests: `pnpm test:all`
  (first time: `pnpm exec playwright install chromium`).

## State at hand-off

- **Primary test account: H.I.G. Capital** (firm `b3eb450e-1edf-4de6-94c9-9d18a48f14f2`).
  Other firms are ignored for testing.
- **Scheduled matching is on for H.I.G. only**: `run-matching-30min` cron
  active, firms come from `scheduled_matching_firms` (migration 0029). H.I.G.
  still had ~110 regulatory items to clear (≈ 3 more runs). Check runs with
  `select * from sync_runs where source = 'matching' order by ran_at desc`
  and spend with `usage_events`.
- **Background analyses** now run one per `regulation-impact` invocation
  (service key + firmId → 202). Verified live.
- **Still owed** (need the H.I.G. user signed in in the app): see the
  "Live AI tests still owed" table in `plans/regway-mvp-roadmap.md`.
- Last pass notes: `prompts/hig-scheduled-matching-*.md`.

## Prompt to paste

---

Read CLAUDE.md, plans/regway-mvp-roadmap.md and
prompts/hig-scheduled-matching-implement.md. Keep using the audit →
implement flow, save each pass's prompt under prompts/, and keep code clean
and scalable. Test only on the H.I.G. Capital account. Check the last few
`matching` rows in `sync_runs` and the AI spend since 2026-10-04 20:00 in
`usage_events`, then continue with the roadmap's Priority order, which is
sorted easiest first (re-sorted 2026-10-04; the roadmap has a table mapping
the old item numbers). Run `pnpm test:all` before and after each change and
add tests for what you build. Deploy and test against the live project; tell me before anything
that deletes or overwrites production data beyond test rows you created.

---
