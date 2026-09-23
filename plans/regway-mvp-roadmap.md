# RegWay MVP roadmap (target: end of week)

## Context

Two backlogs were merged into one prioritized plan: gaps flagged after
wiring up the real backend, plus a product backlog (profile/settings
screens, a landing page, and a Harvey AI overhaul). Day 1's trust/polish
fixes, the relevance-matching prompt fix, and the Federal Register cron
schedule have since shipped — see **Completed** at the bottom. A follow-up
audit of the regulation-sourcing pipeline (triggered by walking through
"how does this actually work" with the user) surfaced real coverage gaps
that now take priority over the Harvey AI work, since they affect whether
the core product's data is trustworthy at all.

Two scope calls locked in earlier are still in effect:
- The fake "Regulatory Diff" / "Operational Implication Breakdown" sections
  were removed, not replaced with real AI analysis (already done).
- **Profile** = personal (name, email, password, sign out). **Settings** =
  firm/workspace (firm details, funds, portfolio companies).

**Firm and fund are always US-based** (confirmed with the user) — no
fund-level foreign-jurisdiction search is needed. Portfolio companies can be
based anywhere; that's the only place non-US coverage actually matters, and
it's partially handled already (see below).

## Priority order

### Fix real US regulation coverage (highest priority)
An audit of the actual pipeline found the "PE Firm" / "Fund Structure" data
source was a narrow, stale proof of concept, not a working coverage
guarantee (12 regulations total, 6 days stale, no scheduler at all — now
fixed, see Completed). The remaining gaps below still undermine coverage
quality, so they stay ahead of further Harvey AI work.

1. **Add pagination** to
   `supabase/functions/sync-federal-register/index.ts` — it currently does
   one fetch capped at `per_page=100` with no loop over subsequent pages.
   If the 9 agencies collectively publish more than 100 RULE/PRORULE items
   in a lookback window, the rest are silently dropped with no error. Loop
   using the API's pagination (`page` param / `total_pages` in the
   response) until exhausted.
2. **Include `NOTICE` type documents**, not just `RULE`/`PRORULE` — this is
   specifically how things like FINRA rule approvals get published (SEC
   approves via a Federal Register notice, not a rule), so they're
   currently invisible to the pipeline. This will add volume; pair with a
   check that `match-relevance`'s filtering still holds up under more noise.
3. **Review and expand the hardcoded 9-agency list**
   (`AGENCY_SLUGS` in the same file: SEC, CFTC, IRS, DOL, EPA, FERC, HHS,
   FMCSA, CFPB) — decide which additional agencies matter based on actual
   portfolio company sectors (candidates: Federal Reserve, OCC, FDIC,
   Treasury/FinCEN as distinct from IRS, FTC, DOJ antitrust, NLRB).

Verify: after each change, check `regulations` row counts/date range and
agency spread directly via psql, not just that the function returns 200.

### Portfolio-company non-US coverage (lower priority — mostly already works)
4. `company-regulations` already builds its search query from a portfolio
   company's real HQ location/region and explicitly asks for foreign
   regulators when applicable — this works today via live Claude web search,
   not a fixed feed. Not guaranteed complete (web search quality varies by
   jurisdiction). Revisit only if real usage surfaces specific gaps for a
   specific country — don't build ahead of an actual problem.

### Harvey AI overhaul
Addresses the explicit "Harvey is slow" complaint plus three concrete asks
(streaming, files, markdown) and one removal (mic).

5. **Streaming responses** — rewrite
   `supabase/functions/harvey-chat/index.ts` to call Anthropic with
   `stream: true` and proxy the raw SSE response body straight through
   (`text/event-stream`) instead of awaiting the full JSON reply. On the
   frontend, `HarveyAICopilot.tsx`'s `sendMessage` switches from a single
   `callFunction` await to `fetch` + `response.body.getReader()`, decoding
   `content_block_delta` (`text_delta`) events and appending to the message
   as they arrive — this is what makes it "type in real time." Web-search
   tool-use events interleave in the stream before text starts; those get
   skipped for display but citations still get collected from
   `citations_delta` events. The full exchange is saved to `harvey_messages`
   once `message_stop` arrives, same as today.
6. **Real markdown rendering** — add `src/lib/markdown.ts`, a small
   self-contained (no new dependency) converter: escape HTML first, then
   handle `## heading`, `**bold**`, `*italic*`/`_italic_`, `- ` / numbered
   lists, and paragraph breaks. Replace the current bold-only regex hack in
   `HarveyAICopilot.tsx` with this, called on every streamed update so
   formatting appears live rather than only at the end.
7. **Remove the mic button** from the compact AI bar in `Dashboard.tsx`
   (~lines 321–330).
8. **File upload** — add an attach control (compact bar in `Dashboard.tsx`
   and the drawer input in `HarveyAICopilot.tsx`). Scope: `.txt`/`.md` files
   get read and inlined into the message text; `.pdf` gets base64-encoded
   client-side and sent as an Anthropic `document` content block (native
   Claude PDF support — no separate parsing needed). Not persisted to
   storage for MVP; it's scoped to that one chat turn.

Verify: send a real question in the browser and confirm text appears
incrementally, markdown renders (try a response with a heading/list), upload
a small PDF and a .txt file and confirm Harvey references their content, and
confirm the mic icon is gone.

### New screens
9. **Landing page** — new `src/components/LandingPage.tsx` shown to
   signed-out users before `AuthScreen` (currently they land directly on
   the auth form with no explanation of the product). Add a `'landing'`
   view to `App.tsx`'s existing state-machine routing (no router library —
   matches the current pattern) as the default unauthenticated view, with
   CTA buttons that route into `AuthScreen` in sign-up or sign-in mode
   (add an `initialMode` prop to `AuthScreen`).
10. **Profile screen** — new `src/components/ProfileScreen.tsx`: email +
    password change via `supabase.auth.updateUser`, the GP's name (currently
    stored as `firms.lead_gp_name` — there's no separate per-user profile
    table, so this stays there for now), and the sign-out action (moved off
    the Dashboard avatar's single-click behavior, which is a bit of a
    footgun for a destructive-ish action). Dashboard's avatar button
    navigates to `'profile'` instead of calling `signOut()` directly.
11. **Settings screen** — new `src/components/SettingsScreen.tsx`: edit firm
    name/HQ/jurisdictions, and manage funds and portfolio companies
    (add/edit/remove) — essentially re-surfacing what onboarding collects,
    but editable afterward. Extract the `TagInput` component currently
    defined inline in `OnboardingModal.tsx` into
    `src/components/TagInput.tsx` so both screens can share it instead of
    duplicating it. Extend `src/lib/data.ts` with the needed write helpers
    (`updateFirm`, `addFund`/`updateFund`/`removeFund`,
    `addPortfolioCompany`/`updatePortfolioCompany`/`removePortfolioCompany`),
    following the existing `setFlagged`/`addNote` pattern already in that
    file. Dashboard's "Settings" pill (currently a dead button) navigates to
    `'settings'`.

Verify: sign out and confirm the landing page shows first; sign back in,
open Profile and change the display name, open Settings and add/remove a
portfolio company, confirm it reflects on the dashboard's Portfolio
Companies tab.

### Buffer — stretch, only if time remains
12. Pre-warm `company-regulations` for each portfolio company right after
    onboarding completes (fire-and-forget loop, same pattern as the existing
    `match-relevance` call in `OnboardingModal.tsx`), so the first dashboard
    visit to a company isn't a cold 30+ second wait.
13. Clean up the two duplicate "NovaPay" test rows in the DB (harmless,
    RLS-isolated, just tidiness — lowest priority item in the whole list).

### Future (no timeline yet — not part of this week's MVP)
- **Per-firm scheduled relevance checks, timezone-aware**: today
  `match-relevance` only ever runs once at onboarding or when manually
  triggered — there's no recurring "check what's newly relevant to my firm"
  schedule at all. When this gets built, it should run at each firm's own
  local time, not a single global UTC time — captured via the browser's
  `Intl.DateTimeFormat().resolvedOptions().timeZone` (once, e.g. during
  onboarding or in the Settings screen above, stored as a new `timezone`
  column on `firms`), not re-detected on every visit. This is distinct from
  `sync-federal-register`'s schedule, which stays global — it fetches the
  same public data for everyone regardless of firm, so there's no reason to
  run it per-tenant. Depends on the Settings screen existing first (to
  capture/edit the stored timezone) and on deciding whether firing an
  actual per-firm cron job per signup is the right mechanism at scale vs. a
  single scheduled sweep that checks all firms and respects each one's
  preferred hour.

### Explicitly deferred
- **SEC EDGAR full-text search integration** (`efts.sec.gov`) — not a
  source of new regulations (it's where companies/advisers file *in
  response to* rules, e.g. 10-Ks, Form ADV/PF, comment letters, no-action
  letters). Could be a genuinely useful complementary feature later (e.g.
  cross-referencing comment letters against a proposed rule), but it's a
  different feature from regulation coverage — don't conflate the two, and
  don't build until there's a concrete use case for it.
- State-level US regulation coverage (Delaware, NY, CA, etc.) — real
  multi-source data-integration work, no dedicated free API equivalent to
  Federal Register exists per state.

## Completed
- **Day 1 polish pass** (commit `ec471ee`): removed the duplicated AI
  summary and the already-obsolete fake deep-dive placeholder text in
  `HeadlineDetailView.tsx`; removed "Recent Shifts" from the History
  toggle; fixed the copyright year 2025 → 2026; rebranded LexPulse → RegWay
  across the app, README, package.json, and the migration header comment.
- **Relevance-matching prompt fix** (same commit, verified in a follow-up
  audit): `match-relevance`'s prompt now explicitly rejects speculative
  reasoning ("may have exposure") and purely administrative/procedural
  notices. Took two tightening passes — the first only removed hedge words
  without fixing the underlying speculative logic. Redeployed, cleared
  `regulation_relevance`, and re-ran for both test firms: confirmed
  `relevant: 0` out of 12 currently-synced items for both, including the
  previously-wrong CFTC whistleblower item now correctly excluded with
  sound reasoning.
- **Federal Register sync scheduling** (migrations `0003`/`0004`, not yet
  committed): enabled `pg_cron`/`pg_net` and scheduled
  `sync-federal-register-daily`. Initially set to 7am UTC — corrected after
  checking the actual operating timezone (America/New_York) to 11am UTC
  (7am Eastern, EDT). Flagged that this will drift to 8am Eastern once EST
  begins in November until manually adjusted to 12pm UTC — no automatic DST
  handling built (not worth it for a daily data-freshness job). Verified
  end-to-end by manually firing the exact `net.http_post` call the cron job
  uses: `status_code 200`, synced 13 new items, `regulations` table now
  spans through the current date instead of being stuck 6 days stale.

## Files most affected (for reference)

- `supabase/functions/sync-federal-register/index.ts` — pagination, NOTICE type, agency list
- `supabase/functions/harvey-chat/index.ts` — streaming rewrite
- `src/components/HarveyAICopilot.tsx` — streaming consumption, markdown, file upload
- `src/lib/markdown.ts` (new) — shared markdown renderer
- `src/components/LandingPage.tsx`, `ProfileScreen.tsx`, `SettingsScreen.tsx`, `TagInput.tsx` (new/extracted)
- `src/lib/data.ts` — new firm/fund/portfolio-company write helpers
- `src/App.tsx` — new `landing`/`profile`/`settings` view states

## Verification approach throughout

`pnpm exec tsc --noEmit` after each numbered item, plus a live check in the
already-running dev server via the browser tool (the dev server at
`localhost:8443` stays up throughout — no need to restart except after
`vite.config.ts`-level changes, which aren't part of this plan). Edge
function changes get deployed via `supabase functions deploy <name>` and
smoke-tested with a real request before moving on. For the regulation
coverage fixes specifically, verify against the actual database state
(row counts, date ranges, agency spread) rather than just a 200 response —
that's exactly what the earlier audit caught that a status-code check
would have missed.
