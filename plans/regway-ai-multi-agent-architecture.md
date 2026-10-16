# RegWay AI: multi-role agentic architecture

**Status (2026-10-15): partly built, differently.** The owner chose to put
the Skeptic on the background matching first and to check chat answers after
they stream, rather than build the full seven-role chat pipeline below. What
was built and what is left: roadmap item 17. This document stays as the
reference for the roles and the reasoning; the "Implementation phases" below
are not the plan being followed.

## Why this file exists

The user's full architecture brief (2026-10-02) is long enough to drown the
main roadmap if inlined there. This file holds the complete plan; the
roadmap carries a priority-ordered summary and links here.

**Explicit non-goal, preserved from the brief:** this stays on Anthropic
Claude only. "Multi-role" means several specialized *docs/notes/instructions*
executed by the same model/provider, orchestrated server-side — not
multiple AI vendors, and not a rewrite of the security model (Supabase
Edge Functions, API key server-side only, RLS-derived firm context).

## What exists today (read before building anything)

Inspected directly, not assumed:

- **`supabase/functions/regway-ai-chat/index.ts`** (222 lines, just
  renamed from `harvey-chat` — see Completed in the main roadmap): one
  `Deno.serve` handler, one Claude call, streamed back as raw SSE. Loads
  firm + funds + portfolio companies (name/size/structure/jurisdictions
  only) into one system-prompt string. Builds a single `web_search` tool
  call per turn. No role separation, no orchestration, no retries, no
  structured intermediate output — today's "pipeline" is
  `Orchestrator == Researcher == Synthesizer == one prompt`.
- **No regulation-context grounding**: the handler never queries
  `regulation_relevance` or `regulations`. The only regulation-specific
  context it ever sees is the single item named in `AiContext.regulation`
  when opened from one regulation's detail page (see
  `contextInstruction()`). Ask it "what's currently relevant to us" with
  the drawer open generically and it has nothing to ground that in except
  a fresh web search disconnected from what RegWay has already matched.
- **No conversation persistence or resume**: `regway_ai_messages` (the
  renamed `harvey_messages`, migration 0001) is `{id, firm_id, user_id,
  role, content, citations, created_at}` — a flat per-firm log with no
  `conversation_id`/`title`/thread concept. Confirmed nothing ever reads
  it back: `grep -rn "regway_ai_messages" src/ supabase/functions/` only
  shows the one `insert()` in `regway-ai-chat/index.ts` itself. The
  frontend's `messages` state in `RegWayAICopilot.tsx` (line 145) is
  `useState<Message[]>(() => [welcomeMessage(context)])` — reset fresh
  every time the component mounts. Every chat today is permanently lost
  once the drawer closes.
- **Structured AI output already exists elsewhere, just not in chat**:
  `_shared/impact.ts`'s `generateImpact()` already forces structured JSON
  via a single `tool_choice`-pinned tool call (`submit_impact_analysis`)
  with a real schema (`overview`, `scope`, `status`, `key_provisions`,
  `key_dates`, `impacts[]` per entity, `considerations`, `limitations`).
  This is the pattern to reuse for role outputs below, not a new
  invention — and its prompt already branches by `category` (regulatory
  vs. enforcement framing), a precedent for role-specific prompting.
- **The "reduce speculative relevance" problem is already a known,
  worked issue, not a new one**: the roadmap's Completed section
  documents at least two prior passes at exactly this —
  "Relevance-matching prompt fix" (commit `ec471ee`, explicitly rejects
  "may have exposure" speculative language) and the "Match correction
  loop" (commit `f187a83`, this session's `rematch-regulation` function —
  a single-shot re-verification call, callable from a "This match looks
  wrong?" UI affordance). A Skeptic role is a natural second pass layered
  on top of these, not a from-scratch concept.
- **Usage/cost measurement already exists**: `_shared/usage.ts`'s
  `recordUsage()` + the `usage_events` table (commit `7b2cc7b`) already
  capture model/tokens/cache/cost per call, keyed by `function_name` and
  `firm_id`. Multi-role tracking is "call it once per role with a
  role-specific `function_name`," not new infrastructure.
- **Rate limiting already exists per-function**: `check_rate_limit` RPC
  (`p_function_name`, `p_limit`, `p_window_minutes`), already used by
  `regway-ai-chat` (30/hour) and `rematch-regulation` (20/hour, this
  session). A multi-role pipeline needs its own limit decision (see Cost
  & Latency below) but the mechanism is in place.
- **Tenant isolation pattern already established**: every existing
  AI-calling function derives `firm_id` server-side from
  `auth.getUser()` → `firm_members` (user-session functions) or accepts a
  trusted `firmId` only from a service-role caller
  (`resolveFirmContext()` in `_shared/relevance.ts`). The multi-role
  pipeline must follow this exactly — no role ever accepts a
  client-supplied `firm_id`.

## Architecture

```
User message (+ optional attachment, + optional AiContext)
        │
        ▼
┌─────────────────────────────────────────────┐
│ Orchestrator (regway-ai-chat, extended)      │
│  - auth + firm context resolution (unchanged)│
│  - classify question: which roles needed?    │
│  - fetch shared evidence once (regulation     │
│    list, firm/fund/company context)           │
│  - fan out independent roles in parallel      │
│  - sequence dependent roles                   │
│  - assemble evidence bundle                   │
└───────────────┬───────────────────────────────┘
                │
   ┌────────────┼─────────────────┬──────────────┐
   ▼            ▼                 ▼              ▼
Regulatory   Company/Firm    (parallel; only  (skipped for
Researcher   Context Analyst  run when needed) simple questions)
   │            │
   └─────┬──────┘
         ▼
   Impact Analyst
         ▼
   Skeptic / Challenge Agent
         ▼
   Citation / Evidence Checker
         ▼
   Final Synthesizer  ──▶  streamed response + evidence trail
                            persisted to conversation history
```

Every box is the **same Claude model**, invoked with a role-specific
system prompt and (where practical) a forced tool-use schema for
structured output — the exact mechanism `_shared/impact.ts` already uses.
"Orchestrator" is not a separate always-on process; it's the first phase
of the same edge function, doing classification before any downstream
call.

## Roles

### 1. Orchestrator
Lives in `regway-ai-chat/index.ts` (extended, not replaced). Responsibilities:
- Resolve firm/user auth (unchanged from today).
- Classify the question's complexity (see Dynamic Agent Selection).
- Fetch the shared evidence every downstream role might need *once*:
  the firm's currently-relevant regulation list (new — see below),
  funds, portfolio companies. Pass slices of this to each role rather
  than having each role re-query.
- Decide the pipeline (which roles, what order, what's parallel).
- Assemble final evidence bundle and hand to the Synthesizer.
- On role failure: retry once, or fall back to a shorter pipeline, or
  mark that evidence as unavailable and say so (never silently drop it).

### 2. Regulatory Researcher
New role. For questions that need research beyond what's already matched
(or when the user asks about something not yet in `regulations`), runs
the `web_search` tool scoped to authoritative sources — the same
agency-priority list already codified in
`supabase/functions/sync-federal-register/index.ts`'s `AGENCY_SLUGS`
(now 21 agencies after today's healthcare/trade expansion) should seed
this role's "prefer these sources" instruction, not be redefined
separately. Structured output (tool-use forced, mirroring
`_shared/impact.ts`'s pattern):

```ts
interface ResearchFinding {
  sources: { title: string; url: string; agency: string; date: string | null }[]
  regulation: { title: string; status: 'proposed' | 'final' | 'effective' | 'withdrawn' | 'unclear'; summary: string }
  key_provisions: string[]
  dates: { published: string | null; effective: string | null; compliance: string | null }
  uncertainties: string[]
}
```

### 3. Company / Firm Context Analyst
New role, but built almost entirely from existing plumbing:
`_shared/relevance.ts`'s `loadFirmEntities()` + `describe()` already load
and format exactly this data for `match-relevance`. This role is mostly
"reuse that loader, add an explicit-connection-or-explicit-gap prompt."
Must never invent a fact not present in `profile`/`sectors`/`regions` —
same "missing fact ≠ assumed fact" principle already established for
Priority order item 7 (fact provenance).

### 4. Impact Analyst
This is the closest to an existing role: `_shared/impact.ts`'s
`generateImpact()` already does firm/fund/company-specific impact
analysis with a forced structured schema, already branches by
`category`. The new work is mostly: (a) make it callable *within* a chat
turn against an ad-hoc research finding instead of only against a stored
`regulations` row, (b) separate its output into the four-tier structure
the brief asks for (explicit requirement / reasonable inference /
uncertain / "confirm with counsel") — `_shared/impact.ts`'s existing
`considerations` + `limitations` fields already approximate tiers 3–4,
tier 1 vs. 2 would be new. **This is also the natural foundation for the
"Regulatory Diff" / "Operational Implication Breakdown" sections that
were deliberately removed rather than faked** (see main roadmap's scope
note) — don't reintroduce those surfaces until this role exists for real.

### 5. Skeptic / Challenge Agent
**New role, does not exist anywhere today.** This is the piece the user
specifically asked for as a separate concern. Takes the Researcher +
Context Analyst + Impact Analyst outputs and actively tries to break the
conclusion — not a rubber stamp. Checklist (from the brief, kept as-is
since it's already specific and good):
source authority, source-supports-claim, unstated company assumptions,
proposed-vs-final confusion, publication-vs-effective-date confusion,
entity-type applicability, missed exemptions/thresholds, federal-vs-state
confusion, speculative connections, "could the opposite be true,"
evidence sufficiency.

Structured output:
```ts
interface SkepticReview {
  supported_claims: string[]
  challenged_claims: { claim: string; reason: string }[]
  missing_evidence: string[]
  alternative_interpretations: string[]
  requires_human_review: boolean
}
```

This directly targets the recurring, already-documented concern in this
codebase (see "Relevance-matching prompt fix" and "Match correction loop"
in Completed) that relevance reasoning can drift speculative. Where this
role differs from the existing `match-relevance` prompt tightening: those
fixes hardened *one* prompt's instructions; the Skeptic is a structurally
separate second pass with its own context window and an explicit mandate
to disagree, which a single self-consistent prompt can't reliably do for
itself (a model is a weak critic of its own single-pass reasoning).

### 6. Citation / Evidence Checker
New role. For each claim the Synthesizer is about to make, confirm it
traces to a specific source in the Researcher's `sources[]` and that the
source is primary, not secondary. Structured output similar to the
Skeptic's shape. This is what makes "why did RegWay tell the user this"
answerable — the Evidence Provenance requirement below.

### 7. Final Synthesizer
Takes everything above, produces the one response the user sees. No new
infrastructure — this is today's response-generation step, just now
consuming structured evidence instead of winging it in one shot. Keeps
all of today's existing constraints (never assign unprompted urgency
labels, cite sources, say "not confident" plainly) plus: never expose
role/orchestration mechanics to the user, never let a Skeptic-flagged
claim through without the caveat attached.

## Regulation-context grounding (do this regardless of the rest)

Independent of the full pipeline, and worth doing first regardless of how
the rest of this plan lands: the Orchestrator's context-fetch step should
query the firm's **currently-matched, non-dismissed regulations** — the
exact same shape `src/lib/data.ts`'s `fetchRelevantRegulations()` already
queries for the dashboard (`regulation_relevance` joined to
`regulations(*)`, filtered `dismissed_at is null`, excluding
`NOT_RELEVANT:` rows) — scoped by firm, and by fund/company when
`AiContext` narrows to one. This closes the gap where asking "what's
relevant to us right now" gets a disconnected fresh web search instead of
RegWay's own already-matched list. See Priority order item 3's own entry
in the main roadmap — this can ship standalone before any other role
exists.

## Chat history (also independent, also worth doing first)

Needs, concretely:
- A new migration adding a conversation grouping to `regway_ai_messages`
  — either a `conversation_id uuid` column (simplest: generate client-side
  per new chat, group by it) or a proper `regway_ai_conversations` table
  (`id, firm_id, user_id, title, created_at, updated_at`) with messages
  referencing it. The table approach is worth the extra migration for a
  real "title" and a conversation list query that doesn't require
  scanning all messages.
- `regway-ai-chat/index.ts` accepts an optional `conversationId`; creates
  one if absent (first message), reuses it otherwise.
- A new read path — nothing reads `regway_ai_messages` today. Needs a
  `fetchConversations(firmId)` and `fetchMessages(conversationId)` in
  `src/lib/data.ts`, RLS already covers firm-scoping (reuses the existing
  "members manage own regway ai messages" policy pattern).
- `RegWayAICopilot.tsx`: a conversation list (sidebar or a picker), a
  "new chat" action that clears `conversationId`, loading past messages
  into `messages` state on resume instead of always starting from
  `welcomeMessage()`.
- Auto-titling: the Synthesizer (or a cheap separate call) can generate a
  short title from the first exchange, same pattern as the existing
  `requestImpact`-style on-demand generation.

This is also independent of the role-based pipeline and should ship
regardless of how much of the rest of this file gets built.

## Dynamic Agent Selection

Orchestrator classifies before calling anything else. Three tiers (not
a fixed five — the brief's examples are illustrative, not exhaustive):

| Question shape | Pipeline |
|---|---|
| General/definitional, no firm-specific claim | Orchestrator → Researcher → Synthesizer |
| About a specific regulation, no applicability claim | Orchestrator → Researcher → Impact Analyst → Citation Checker → Synthesizer |
| "Does this affect us/this entity" (applicability claim) | Orchestrator → Researcher + Context Analyst (parallel) → Impact Analyst → Skeptic → Citation Checker → Synthesizer |

The classification step itself is a cheap, short Claude call (or
heuristic: does the message or `AiContext` reference a specific
regulation/entity + ask an applicability question — a keyword/shape
check may suffice for v1 before spending a model call just to route).

## Parallelism

Researcher and Context Analyst have no data dependency on each other —
run via `Promise.all`, same pattern already used in
`regway-ai-chat/index.ts` (`Promise.all([funds, companies])`) and
`_shared/impact.ts` (`Promise.all([reg, firm, funds, companies, links])`).
Impact Analyst depends on both; Skeptic depends on Impact Analyst;
Citation Checker depends on Skeptic (needs to know what survived
challenge); Synthesizer depends on everything. No further parallelism
available in the dependent chain — this is already the maximum
parallelism the task shape allows.

## Structured outputs

Every role above uses Claude's forced tool-use (`tool_choice: { type:
'tool', name: '...' }`), exactly `_shared/impact.ts`'s existing pattern —
not a new mechanism. Schemas are sketched above per role; finalize them
against real example transcripts during Phase 2–5 below, not upfront.

## Evidence provenance

Every Researcher-sourced claim carries `{source_url, agency, date}`
through every downstream role unchanged (never re-derived or
paraphrased away) so the Synthesizer's final citations are always
traceable to the original `sources[]` entry, and so a future "why did
RegWay say this" surface (not scoped yet) has something real to show.

## Confidence

Per the brief: no user-facing severity labels (`Critical`/`Flagged`/
consistent with the existing, deliberate "RegWay lets the user decide
priority" stance already enforced in `regway-ai-chat`'s system prompt
today — "Never assign an unprompted urgency label"). The Skeptic's
`requires_human_review` and confidence signals stay internal, feeding
only the Synthesizer's caveat language, never a UI badge.

## Cost and latency

- Minimum roles necessary per the routing table above — never run all
  seven for a simple question.
- Parallelize per the Parallelism section.
- Reuse the Orchestrator's one-time context fetch across all roles in
  the same turn — never let two roles separately re-query the same
  firm/fund/company data.
- `recordUsage()` already exists — call it once per role invocation with
  a distinct `function_name` (e.g. `regway-ai-chat/researcher`,
  `regway-ai-chat/skeptic`) so per-role cost is visible in `usage_events`
  without new infrastructure.
- Track, per request: role count invoked, total latency, total tokens,
  estimated cost, research success/failure, citation-check failures,
  Skeptic-flagged (false-positive-relevance) rate — all derivable from
  `usage_events` plus a new lightweight per-turn log, not a new
  measurement system from scratch.
- Model choice per role: Sonnet for Researcher/Context/Impact/Skeptic/
  Synthesizer (reasoning-heavy); evaluate Haiku for the classification
  step and for Citation Checker (more mechanical, similar to the
  existing "consider Haiku for match-relevance" item in Priority order
  item 9) — only after a real side-by-side accuracy check, same bar as
  that item.
- Prompt caching: system-prompt portions that repeat within a turn
  (shared firm/fund/company context passed to multiple roles) should use
  `cache_control: ephemeral`, same pattern already in
  `regway-ai-chat`/`match-relevance`/`_shared/impact.ts`.

## Failure handling

- Web search failure in Researcher → Orchestrator marks that evidence
  incomplete, tells Synthesizer explicitly, Synthesizer says so to the
  user rather than presenting a gap-filled answer.
- Malformed structured output from any role → one retry with the same
  input; on second failure, treat as missing evidence (same path as
  above), never crash the whole turn.
- Timeout on any single role → same fallback; the Orchestrator should
  have a per-role timeout well under the overall request timeout so one
  slow role can't hang the whole response.
- Skeptic flags `requires_human_review: true` → Synthesizer must surface
  that explicitly, never silently downgrade it.
- One role failing must never take down the whole chat turn — this is
  the main reason for the Orchestrator/role split over the current
  monolithic try/catch in `regway-ai-chat/index.ts`.

## Security and tenant isolation

No change to the existing model, just preserved exactly through the
refactor:
- Firm context is derived server-side from the authenticated user's
  session (`auth.getUser()` → `firm_members`), exactly as
  `regway-ai-chat/index.ts` does today. No role ever accepts a
  client-supplied `firm_id`.
- All role-to-role data passing happens inside one edge function
  invocation (in-process, not over the network) unless a role is split
  into its own function later for independent scaling — if it ever is,
  that function must re-derive firm context itself via the same
  `resolveFirmContext()`/`auth.getUser()` pattern, never trust a
  firm_id passed from a sibling role.
- RLS stays authoritative for all data access; the service-role client
  (used today for `usage_events`, which has no RLS policies) stays
  scoped to exactly what it's used for today — usage logging — not
  widened to a general bypass for the new roles.
- Conversation history (new) gets the same RLS policy pattern as
  `regway_ai_messages` today (`firm_id = auth_firm_id()`).

## Do not overbuild — applied

Concretely, for this codebase: don't split every role into its own edge
function on day one (network hops between roles would add latency for no
benefit while everything fits one request's lifetime); don't build a
generic "agent framework" — each role is a typed function with a system
prompt and a schema, called from the Orchestrator's own code, the same
shape `_shared/impact.ts` already is. Don't touch `match-relevance`,
`match-enforcement-relevance`, `company-regulations`, or
`rematch-regulation` — they stay as the batch/background matching layer;
this plan is additive to the interactive chat surface, not a replacement
for the existing matching pipeline.

## Implementation phases

1. **Architecture** — finalize role contracts (TypeScript interfaces
   above, refined against real examples), routing rules, evidence
   format. No UI change.
2. **Regulation-context grounding** — ship independently (see above),
   immediately useful on its own.
3. **Chat history** — ship independently (see above), immediately
   useful on its own.
4. **Regulatory Researcher extraction** — pull research into its own
   role/prompt, verify source quality holds against today's baseline.
5. **Context Analyst** — add firm/fund/portfolio grounding to chat
   (reusing `_shared/relevance.ts` loaders), test against multiple
   hypothetical firms for unstated assumptions.
6. **Impact Analyst** — structured impact output in chat, reusing/
   extending `_shared/impact.ts`'s existing schema and category-branch
   pattern.
7. **Skeptic + Citation Checker** — the highest-value pair for cutting
   speculative relevance claims; ship together since the Skeptic's output
   is what the Citation Checker verifies against.
8. **Dynamic routing** — Orchestrator classification, the three-tier
   table above, short-circuiting to the cheap path for simple questions.
9. **Parallel execution** — `Promise.all` the independent branches;
   measure latency before/after against logged `usage_events` data.
10. **Evaluation** — see below. Nothing in phases 4–9 ships to all users
    until this passes.

## Evaluation

Build a fixed test set covering: clearly relevant regulations, clearly
irrelevant ones, borderline cases, incomplete company profiles,
conflicting sources, proposed-vs-final pairs, federal-vs-state pairs,
each portfolio-company sector currently in the test data (healthcare,
tech, aerospace/defense — see the H.I.G. Capital test account built
2026-10-02), and each fund structure. Measure: relevance precision,
false-positive rate, false-negative rate, citation correctness, rate of
unsupported claims reaching the Synthesizer, latency, and cost per
question tier. Acceptance bar TBD with the user before Phase 7 ships —
don't guess a number now.

## Acceptance criteria (draft — confirm before building)

- Regulation-context grounding: a generic "what's relevant to us"
  question answers from RegWay's own matched list, not a disconnected
  fresh search, verified live against a real firm with real matches.
- Chat history: a user can close the drawer, reopen it, and see (or
  explicitly choose to resume) a prior conversation; can start a
  genuinely new one without old context bleeding in.
- Skeptic: on the existing evaluation set (once built), measurably
  reduces speculative-relevance false positives versus the current
  single-pass baseline — not just "feels more careful."
- No regression: existing single-shot chat behavior (streaming, markdown,
  file upload, context-scoping, citations) keeps working throughout every
  phase — each phase ships behind verification, not as a big-bang swap.
