# Implement: Copilot context

You're working in the RegWay repo (`/Users/ulykbekkhairulla/dev/regpe`).
Use the findings from `docs/notes/27-copilot-context-investigate.md`:
confirmed no existing call site passes a payload to `navigate('ai', ...)`
(safe to fix the early-return), confirmed `harvey_messages` needs no
schema change, confirmed the fund/company drill-downs and
`HeadlineDetailView`'s `headline` prop already hold everything needed to
describe the scoped entity without an extra fetch.

## `src/lib/types.ts`

1. Add `export interface AiContext { type: 'regulation' | 'fund' | 'company'; id: string; name: string; regulation?: { agency?: string | null; jurisdiction?: string | null; summary?: string | null; published_date?: string | null; effective_date?: string | null } }`.

## `src/App.tsx`

2. Fix the `navigate()` early-return: `if (newView === 'ai') { setShowAI(true); setAiContext((payload as AiContext | undefined) ?? null); return }` — add `const [aiContext, setAiContext] = useState<AiContext | null>(null)` alongside the other view state.
3. Pass `context={aiContext}` to `<RegWayAICopilot>`.
4. Add `onAskAI={(ctx: AiContext) => navigate('ai', ctx)}` prop to
   `<HeadlineDetailView>`.
5. Reset `aiContext` to `null` when the drawer closes (in the `onClose`
   handler passed to `RegWayAICopilot`, alongside `setShowAI(false)`) so a
   later generic open doesn't inherit stale scoping.

## `src/components/HeadlineDetailView.tsx`

6. Add `onAskAI: (context: AiContext) => void` to
   `HeadlineDetailViewProps`, import `AiContext` from `../lib/types`.
7. Add an "Ask RegWay AI about this" button to the Action Toolbar (same
   row as Flag/Add Note/Dismiss, same button style), calling `onAskAI({
   type: 'regulation', id: regulationId!, name: title, regulation: {
   agency: headline?.agency, jurisdiction: headline?.jurisdiction, summary:
   headline?.summary, published_date: headline?.published_date,
   effective_date: headline?.effective_date } })`. Disable/hide it if
   `!regulationId` (matches the existing guard pattern other toolbar
   actions use).

## `src/components/Dashboard.tsx`

8. Import `AiContext` from `../lib/types`.
9. In the `selectedFund && (...)` block, add an "Ask AI about this fund"
   button above or alongside the regulation list (visible once a fund is
   selected, regardless of loading state) calling `onNavigate('ai', {
   type: 'fund', id: selectedFund, name: funds.find(f => f.id ===
   selectedFund)?.name ?? 'this fund' } satisfies AiContext)`.
10. Same for `selectedCompany && (...)`: "Ask AI about this company" ->
    `onNavigate('ai', { type: 'company', id: selectedCompany, name:
    companies.find(c => c.id === selectedCompany)?.name ?? 'this company'
    } satisfies AiContext)`.

## `src/components/RegWayAICopilot.tsx`

11. Add `context?: AiContext | null` to `RegWayAICopilotProps`, import
    `AiContext` from `../lib/types`.
12. Replace the static `WELCOME_MESSAGE` constant with a function
    `welcomeMessage(context?: AiContext | null): Message` returning a
    context-aware greeting (e.g. for `fund`/`company`: `` `Ask me anything
    about ${context.name}'s regulatory exposure — I'll search live
    sources and cite what I find.` ``; for `regulation`: `` `Ask me
    anything about "${context.name}" — I'll search live sources and cite
    what I find.` ``; otherwise keep today's firm-wide wording). Initialize
    `messages` state from `welcomeMessage(context)` instead of the
    constant.
13. Update the header subtitle (`firm ? ... : 'Loading firm context…'`,
    line ~403) to show the scoped entity name when `context` is set (e.g.
    `` context ? `Focused on ${context.name}` : firm ? `Grounded in live
    web search for ${firm.name}` : 'Loading firm context…' ``).
14. Pass `context` through in `sendMessage`'s call to `streamFunction`:
    `streamFunction('harvey-chat', { message: text, attachment, context },
    controller.signal)`.

## `supabase/functions/harvey-chat/index.ts`

15. Accept `context` in the request body type: `{ message?: string;
    attachment?: Attachment; context?: AiContext }` (define a local
    `AiContext` type matching the frontend's, or inline the shape — this
    is a separate Deno module, no shared import path to the frontend
    types).
16. After building `systemPrompt`, append a scoping paragraph when
    `context` is present:
    - `type: 'regulation'`: describe the regulation using whatever
      `context.regulation` fields are present (agency, jurisdiction,
      summary, dates), ending with an instruction to treat the
      conversation as being about this regulation unless the user clearly
      asks about something else.
    - `type: 'fund' | 'company'`: a shorter line naming the entity with
      the same "treat the conversation as being about this specific
      {type} unless..." instruction.
17. Unconditionally (regardless of `context`) add one instruction to the
    system prompt covering the no-context case: if the user's question
    refers to "my fund", "this company", "the portfolio company", etc.
    without naming which one, and more than one fund or portfolio company
    exists, ask them which one they mean instead of guessing.

## Verify

- `pnpm exec tsc --noEmit`.
- Live in the browser:
  - Open the AI copilot from the generic Dashboard bar — confirm the
    welcome message and header subtitle are unchanged (firm-wide,
    unscoped).
  - Select a fund in Fund Structure, click "Ask AI about this fund" —
    confirm the drawer opens with a fund-scoped welcome message and
    header subtitle, and a sent message gets an answer that stays on that
    fund.
  - Same for a portfolio company from Portfolio Companies.
  - Open a regulation's detail page, click "Ask RegWay AI about this" —
    confirm the drawer opens scoped to that regulation's title, and ask a
    vague follow-up ("what does this mean for us") to confirm the model
    treats it as being about that regulation without the user re-stating
    it.
  - From the generic (unscoped) entry, ask an ambiguous question like
    "what's my fund exposed to" when more than one fund exists — confirm
    the model asks which fund instead of picking one silently.
  - Close the drawer and reopen it generically after a scoped session —
    confirm it's back to the unscoped firm-wide welcome (context reset).
