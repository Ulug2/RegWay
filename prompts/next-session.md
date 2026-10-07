# Next session — starting prompt

Last updated 2026-10-07 (UTC). All work is on `main`, pushed. Production
(Supabase project `cfspwaqtidfliupmlfwz`) matches it on the server side:
migrations 0024–0032 applied, every edge function deployed.

**Frontend**: the site is https://reg-way.vercel.app. Check that its build
is the latest `main` (the landing page's source list should include "UK
FCA" and "EU sanctions"); if not, redeploy. Skipped for now by the owner:
item 11b, the move to `regwayai.com`.

Done since the last note: item 11a (review fixes), item 12 Phase 2
(regulator feeds: SEC, FTC, CFPB, UK, EU, with a jurisdiction pre-filter)
and item 13's UK / EU sanctions. Next in the roadmap's order: item 14
(source registry grounding), unless the owner picks item 12 Phase 3
(alerts), which needs an email provider.

## Setting up on the Mac

- Work on `main` (already fast-forwarded to the branch on the Mac); commit
  the 11a changes and `git push origin main` when the owner says so.
- `pnpm install`; `.env.local` (gitignored) with `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` (the publishable key); `pnpm dev`.
- Deploys / SQL: `SUPABASE_ACCESS_TOKEN` set, `supabase` CLI, then
  `supabase functions deploy --project-ref cfspwaqtidfliupmlfwz --use-api`.
- Checks: `pnpm test:all` (type-checks, 336 unit tests, 84 browser tests;
  first time `pnpm exec playwright install chromium`).

## State at hand-off

- **Primary test account: H.I.G. Capital** (firm `b3eb450e-1edf-4de6-94c9-9d18a48f14f2`).
  Other firms are ignored for testing.
- **Feeds**: `sync-regulator-feeds` every 30 minutes (:05 / :35), one
  `sync_runs` row per run (`regulator_feeds`, per-feed results in `stats`).
  sec.gov answers 429 about 1 run in 10; a feed must fail three runs in a
  row before the run counts as failed.
- **Scheduled matching** runs for H.I.G. only (`scheduled_matching_firms`,
  cron `run-matching-30min`); H.I.G.'s backlog is clear and runs since are
  no-ops. Check: `select * from sync_runs where source = 'matching' order by ran_at desc`.
- **Models:** regulatory matcher on Claude Haiku 4.5; geopolitical and
  enforcement matchers, analyses, chat and scans on Sonnet 4.5; every
  verdict call at temperature 0. `usage.ts` prices per model.
- **AI spend**: check `select sum(estimated_cost_usd) from usage_events` (about $15 all time on 2026-10-07).
- **Waiting on the owner:**
  - H.I.G.'s firm strategies still include "Venture Capital", added for
    the live re-discovery test on 2026-10-05 (it worked; see roadmap item
    11a). The owner removes it in Settings → Firm; that save runs one more
    re-check.
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
Priority order (next: item 14). Run
`pnpm test:all` before and after each change and add tests for what you
build. Deploy and test against the live project; tell me before anything
that deletes or overwrites production data beyond test rows you created.

---
