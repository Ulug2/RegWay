# Copilot: ground answers in the firm's matched developments — implement

Follows `prompts/copilot-grounding-investigate.md` (same prompt).

## What was built

| Piece | Where |
|---|---|
| Loader/formatter for the firm's live matches (not dismissed, not `NOT_RELEVANT`), scoped firm / fund / company / regulation, read with the caller's RLS-scoped client, grouped by development with each entity's reason, newest 40 | `supabase/functions/_shared/matchedDevelopments.ts` (new) |
| Matched list + instructions in the cached system prompt (answer "what's relevant" from it first, say so, web search for detail/newer, absence isn't proof) | `supabase/functions/regway-ai-chat/index.ts` |
| Company scans now ask for and store a real per-item reason (`why_it_applies`); the old descriptor is the fallback | `supabase/functions/company-regulations/index.ts` |

## Found along the way

Every company-scan match stored the placeholder "AI web-search scan for
<company> (<sector>, <location>)" as its reason: 68 of the firm's live
matches today, and what the dashboard's new "Why it's here" line shows for
them. Fixed for future scans; existing rows keep the placeholder until the
company is rescanned (weekly, or after a profile edit). Not verified live:
a scan costs ~$0.20 and the owner asked to keep spend low.

## Verification

- Rendered the context for H.I.G.'s real data (free): 22 developments,
  ~1,800 tokens firm-wide; scoping to A.L.A. lists its 8.
- One live message as a throwaway user (deleted) with two seeded matches:
  listed both with the right entity, each reason, and "Scheduled
  publication" for the not-yet-published SEC proposal; no web search.
  $0.0138 (system prompt cache-written, 2,341 tokens).
- Session AI spend after credit was restored: $0.024 total (this message
  and the geopolitical re-check).
