# Next session — starting prompt

Paste this as the first message of a new cloud session (after the network
allowlist includes `www.govinfo.gov` and `SUPABASE_ACCESS_TOKEN` is set):

---

Read CLAUDE.md, plans/regway-mvp-roadmap.md, and the two
prompts/geopolitical-monitoring-*.md files. Keep using the audit → implement
flow, save each pass's prompt under prompts/, and keep code clean and
scalable.

1. Check the environment: `SUPABASE_ACCESS_TOKEN` is set, `supabase` CLI can
   list project cfspwaqtidfliupmlfwz's functions, and federalregister.gov,
   travel.state.gov, www.govinfo.gov and esm.sh are reachable.
2. Recheck the previous session's work with full access:
   - Fix roadmap Priority order item 1.2 (Federal Register full text can
     silently be the unblock/CAPTCHA page): audit first, then make
     `_shared/text.ts` treat a redirect to unblock.federalregister.gov as a
     failure and fall back to GovInfo. Verify on real documents, redeploy,
     re-run the sync backfill, and re-check the 45 country-less SDN notices
     and any impact analyses written from a CAPTCHA page.
   - Sanity-check the feeds against their live shape: the State Department
     advisories RSS, and which presidential documents the topic filter
     keeps/drops over the last 9 months.
   - Redeploy with the CLI every function still on the old shared code
     (match-enforcement-relevance, rematch-regulation, company-regulations,
     sync-sec-enforcement, sync-finra-enforcement,
     sync-sec-admin-proceedings), so production matches the repo.
3. Then continue with roadmap item 1's remaining Phase 2 work, starting
   with fund → company holdings.

Deploy and test against the live project; tell me before anything that
deletes or overwrites production data beyond test rows you created.
