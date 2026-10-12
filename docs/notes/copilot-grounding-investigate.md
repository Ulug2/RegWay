# Copilot: ground answers in the firm's matched developments — investigate

Roadmap: `plans/regway-mvp-roadmap.md` → Priority order item 3.

## Prompt

> Okay I added some credits. Check whatever u need to check but don't spend
> a lot. Then go to the next task

## Checks done first (with credit restored)

- Geopolitical re-check, live, on a throwaway firm (deleted): with a
  correction note the model ruled the aircraft proclamation not relevant to
  the seeded company, the company row was replaced and the holdings-derived
  fund row went with it. Cost $0.0101.
- Scheduled matching: the first run with credit would clear every firm's
  backlog (≈ 900 regulatory, 210 enforcement, a few hundred geopolitical
  candidates across 5 firms ≈ 40 batches, plus impact analyses for new
  matches): about $3–5 one-time, over half of it test accounts. Asked; the
  owner chose to **keep `run-matching-30min` paused** (`cron.alter_job …
  active := false`). A `sync_runs` row records the pause so the dashboard
  banner doesn't report it as a failure.

## What exists (`regway-ai-chat/index.ts`)

| Piece | State |
|---|---|
| Firm context | Firm name/HQ/jurisdictions; funds (name, size, structure, jurisdictions); companies (name, sectors, regions). |
| Opened from an entity | `AiContext` = fund / company / regulation, adds one instruction line. From a regulation: its agency, dates, summary — but **not why it was matched** to the firm's entities. |
| Matched developments | **Never read.** No query to `regulation_relevance` anywhere in the function. "What's relevant to us right now?" has only a fresh web search to go on. |
| Caching | System prompt and web_search tool are `cache_control: ephemeral`. |
| Conversation history | Each message is sent alone (no prior turns). Roadmap item 4, out of scope here. |

## Plan

1. `_shared/matchedDevelopments.ts`: load the firm's live matches (not
   dismissed, not `NOT_RELEVANT`) through the **caller's** client so RLS
   keeps it to their firm even if `AiContext.id` is forged; scoped to the
   fund / company / regulation the chat was opened from, else firm-wide.
   Group by development, newest first, capped, each with category, issuer,
   date (or "scheduled for"), and each entity's own reason. Reusable by the
   multi-role Context Analyst later (item 5).
2. Add it to the system prompt (already cached) with instructions: answer
   "what's relevant" from this list first and say it's what RegWay matched;
   use web search for detail or anything newer; an item's absence isn't
   proof it doesn't apply (matching covers tracked sources only).
3. Verify: print the prompt for real data (free), then one live message on
   a throwaway firm.
