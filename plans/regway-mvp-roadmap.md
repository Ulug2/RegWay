# RegWay MVP roadmap (target: end of week)

## Context

Two backlogs need merging into one prioritized plan: gaps I flagged after
wiring up the real backend (fake deep-dive content, over-permissive AI
relevance matching, no non-US coverage, slow company scans, duplicate rows),
plus a new product backlog (profile/settings screens, dedup a redundant AI
summary, trim the History toggle, rebrand to RegWay, a landing page, a
copyright-year typo, and a Harvey AI overhaul — streaming, file upload, no
mic, real markdown rendering).

Two scope calls are already locked in with the user:
- The fake "Regulatory Diff" / "Operational Implication Breakdown" sections
  get **removed**, not replaced with real AI analysis — too large to build
  safely by Friday, and leaving fabricated content on a regulatory-compliance
  product is a trust problem, not a nice-to-have fix.
- **Profile** = personal (name, email, password, sign out). **Settings** =
  firm/workspace (firm details, funds, portfolio companies).

Non-US jurisdiction coverage (EU/Cayman/Delaware state law) is explicitly
**out of scope this week** — it's a multi-source data-integration project,
not a UI/prompt fix.

## Priority order

### Day 1 (today) — quick trust/polish fixes
Low risk, mechanical, clears the ground before the bigger Harvey work.

1. **Remove duplicated AI summary** — `src/components/HeadlineDetailView.tsx`
   currently renders `headline.summary` twice: once under the title (~line
   111) and again in the "Context & Overview" section (~line 254). Delete the
   first occurrence; keep the one in Context & Overview as the single home
   for it.
2. **Remove the fake deep-dive sections** — delete the "Regulatory Diff" and
   "Operational Implication Breakdown" blocks from the same file (they're
   currently hardcoded Form-PF demo copy shown for every regulation
   regardless of what it actually is). Context & Overview + Regulatory
   Metadata + Primary Source remain as the real, honest content.
3. **Remove "Recent Shifts"** from `DATE_MODES` in
   `HeadlineDetailView.tsx` (~line 10), leaving `Today's Status` /
   `Custom Range`.
4. **Copyright year 2025 → 2026** — two spots:
   `Dashboard.tsx` (~line 364) and `HeadlineDetailView.tsx` (~line 335).
5. **Rebrand LexPulse → RegWay everywhere** — mechanical find/replace across
   `App.tsx`, `AuthScreen.tsx`, `Dashboard.tsx`, `HeadlineDetailView.tsx`,
   `OnboardingModal.tsx`, `HarveyAICopilot.tsx`, `index.html` (title + meta
   description), `README.md`, the `supabase/migrations/0001_init.sql`
   header comment, and `package.json`'s `name` field (`lexpulse` →
   `regway`). "Harvey AI" is a feature/assistant name, not the app brand —
   leave it as-is.

Verify: `pnpm exec tsc --noEmit`, then a full click-through in the browser
(dashboard → a headline → back) to confirm nothing broke visually.

### Day 1–2 — fix over-permissive relevance matching
6. **Tighten the `match-relevance` prompt**
   (`supabase/functions/match-relevance/index.ts`) — it currently instructs
   Claude to "be strict" but that let a CFTC whistleblower notice through on
   "Meridian *may have* CFTC-regulated activities" reasoning. Add an explicit
   rule: speculative/hypothetical connections ("may have", "could be
   exposed to") must be marked **not** relevant — only a concrete,
   name-able connection to a specific listed jurisdiction, fund structure,
   or portfolio company sector counts.
7. Redeploy (`supabase functions deploy match-relevance`) and clear existing
   `regulation_relevance` rows for the test firm(s) via psql so the next run
   re-evaluates from scratch with the stricter prompt (the function currently
   skips anything already evaluated, so the bad verdict won't self-correct
   otherwise).

### Day 2 — Harvey AI overhaul
The single biggest chunk of new work, addressing the explicit "Harvey is
slow" complaint plus three concrete asks (streaming, files, markdown) and one
removal (mic).

8. **Streaming responses** — rewrite
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
9. **Real markdown rendering** — add `src/lib/markdown.ts`, a small
   self-contained (no new dependency) converter: escape HTML first, then
   handle `## heading`, `**bold**`, `*italic*`/`_italic_`, `- ` / numbered
   lists, and paragraph breaks. Replace the current bold-only regex hack in
   `HarveyAICopilot.tsx` with this, called on every streamed update so
   formatting appears live rather than only at the end.
10. **Remove the mic button** from the compact AI bar in `Dashboard.tsx`
    (~lines 321–330).
11. **File upload** — add an attach control (compact bar in `Dashboard.tsx`
    and the drawer input in `HarveyAICopilot.tsx`). Scope: `.txt`/`.md` files
    get read and inlined into the message text; `.pdf` gets base64-encoded
    client-side and sent as an Anthropic `document` content block (native
    Claude PDF support — no separate parsing needed). Not persisted to
    storage for MVP; it's scoped to that one chat turn.

Verify: send a real question in the browser and confirm text appears
incrementally, markdown renders (try a response with a heading/list), upload
a small PDF and a .txt file and confirm Harvey references their content, and
confirm the mic icon is gone.

### Day 3 — new screens
12. **Landing page** — new `src/components/LandingPage.tsx` shown to
    signed-out users before `AuthScreen` (currently they land directly on
    the auth form with no explanation of the product). Add a `'landing'`
    view to `App.tsx`'s existing state-machine routing (no router library —
    matches the current pattern) as the default unauthenticated view, with
    CTA buttons that route into `AuthScreen` in sign-up or sign-in mode
    (add an `initialMode` prop to `AuthScreen`).
13. **Profile screen** — new `src/components/ProfileScreen.tsx`: email +
    password change via `supabase.auth.updateUser`, the GP's name (currently
    stored as `firms.lead_gp_name` — there's no separate per-user profile
    table, so this stays there for now), and the sign-out action (moved off
    the Dashboard avatar's single-click behavior, which is a bit of a
    footgun for a destructive-ish action). Dashboard's avatar button
    navigates to `'profile'` instead of calling `signOut()` directly.
14. **Settings screen** — new `src/components/SettingsScreen.tsx`: edit firm
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

### Day 4 (Friday, buffer) — stretch, only if time remains
15. Pre-warm `company-regulations` for each portfolio company right after
    onboarding completes (fire-and-forget loop, same pattern as the existing
    `match-relevance` call in `OnboardingModal.tsx`), so the first dashboard
    visit to a company isn't a cold 30+ second wait.
16. Clean up the two duplicate "NovaPay" test rows in the DB (harmless,
    RLS-isolated, just tidiness — lowest priority item in the whole list).

### Explicitly deferred beyond this week
- Non-US jurisdiction coverage (state law, EU, Cayman, etc.) — real
  multi-source data integration work, not a fit for a Friday deadline.

## Files most affected (for reference)

- `src/components/HeadlineDetailView.tsx` — dedup, remove fake sections, drop Recent Shifts, year fix, rebrand
- `src/components/Dashboard.tsx` — year fix, rebrand, remove mic, wire Settings/avatar nav
- `supabase/functions/match-relevance/index.ts` — stricter prompt
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
smoke-tested with a real request before moving on, same workflow used
earlier in this project.
