# Investigate: Copilot context

Roadmap item: "Partial — needs rework, not new build" #2 — copilot context.
Doc wants the copilot opened from an entity or detail page to start scoped
to that entity/item, and to ask which entity is meant rather than guess.
Confirmed this session by reading the current code:

## Current state (the gap)

- `RegWayAICopilot` (`src/components/RegWayAICopilot.tsx:134`) takes only
  `{ onClose }` — no scoping prop of any kind. It always loads the whole
  firm + every fund + every company (`src/lib/data.ts`'s `fetchFunds`/
  `fetchPortfolioCompanies`) regardless of where it was opened from.
- `App.tsx`'s `navigate()` (line 70-82): `if (newView === 'ai') {
  setShowAI(true); return }` — a payload passed to `navigate('ai', ...)`
  would currently be silently dropped for the `'ai'` case specifically
  (the `else if (payload) setDetailPayload(payload)` branch is skipped
  because of the early `return` above it).
- Every existing call site opens it generic: `Dashboard.tsx`'s bottom AI
  bar calls `onNavigate('ai')` with no payload (lines ~443-459, now
  shifted after the fund-selection change). `HeadlineDetailView.tsx` has
  **no AI entry point at all** — confirmed by grep, zero matches for
  `onNavigate`/`ai` in that file. It also isn't passed `onNavigate` by
  `App.tsx` today (only `onBack` and `headline`).
- `supabase/functions/harvey-chat/index.ts` (lines 60-86) builds one fixed
  system prompt per request: firm name/HQ/jurisdictions + a flat summary
  of every fund and every company. No per-request scoping field exists in
  the request body (`{ message, attachment }` only, line 40). The system
  prompt block is cache_control-tagged — confirmed this session's own
  earlier caching work — so appending a scoping line to it only affects
  cache-key identity for that specific scoped conversation, not the
  unscoped case; no interaction with the existing cache mechanics beyond
  that.
- `Dashboard.tsx`'s per-fund and per-company drill-downs (`selectedFund &&
  ...` around line 358, `selectedCompany && ...` around line 415, current
  line numbers after the fund-selection-page change) are the natural
  "entity page" the doc means — confirmed both already hold the selected
  entity's `id` and the firm already has its `name` in state (`funds`/
  `companies` arrays), so no extra fetch is needed to label an "Ask AI
  about this" action.
- `HeadlineDetailView` already holds the full `Regulation` object as
  `headline` (title, agency, jurisdiction, summary, published/effective
  dates, source_url) — enough to describe the regulation to the system
  prompt without a second DB round-trip from the backend.

## Steps

1. Confirm no other call site already passes a payload to `navigate('ai',
   ...)` that the early-return bug would be silently breaking today (grep
   `onNavigate('ai'` across `src/`) — if none do, the early-return is
   currently harmless but needs fixing as part of this work regardless,
   since every new entry point this task adds will pass one.
2. Confirm `harvey_messages` persistence (`persist()` in `harvey-chat`)
   doesn't need a scoping column — scoping is a per-request system-prompt
   detail, not stored state, so no migration should be needed. Verify by
   reading the full `persist()` call and the `harvey_messages` table
   definition to be sure nothing else reads that table expecting a fixed
   shape.
3. Decide the exact shape of the context object passed from frontend to
   backend — confirm it should carry enough for the backend to build a
   system-prompt line without re-querying (`type`, `id`, `name`, and for
   `type: 'regulation'` specifically the handful of fields already sitting
   in `HeadlineDetailView`'s `headline` prop) rather than just an id the
   backend would have to look up.
4. Confirm the welcome message / header subtitle in
   `RegWayAICopilot.tsx` (currently `WELCOME_MESSAGE` constant and the
   `firm ? ... : 'Loading firm context…'` header line) can be made
   context-aware without restructuring — both are plain local
   values/JSX, not fetched.
5. For "ask which entity is meant rather than guess": confirm this is a
   system-prompt instruction, not new UI — the system prompt already
   lists every fund and company by name (`fundSummary`/`companySummary`),
   so the model has what it needs to recognize an ambiguous reference
   ("my fund", "this company") when more than one exists and no scoping
   context was passed; it currently has no instruction telling it to ask
   instead of picking one.

## Output

Confirmed context-object shape, confirmed the `navigate()` early-return
bug and exact fix, confirmed welcome-message/header wiring points, and a
concrete plan for the two new entry points (fund/company drill-down,
regulation detail) plus the harvey-chat system-prompt changes, ready to
implement.
