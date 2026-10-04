# Copilot: save and resume chats — investigate

Roadmap: `plans/regway-mvp-roadmap.md` → Priority order item 4; design notes
in `plans/regway-ai-multi-agent-architecture.md` → "Chat history".

## Prompt

> We have not tested the AI because there is not enough money right? Just
> note that in roadmap what we need to test. Then work on the next task.
> Also count how much money u need to test all that. Also do we have in our
> roadmap how to make the AI cost cheaper?

(The roadmap parts were done first: "Live AI tests still owed" with costs,
and item 9 reworked. This pass is the "next task".)

## What exists

| Piece | State |
|---|---|
| `regway_ai_messages` | Flat per-firm log (`firm_id, user_id, role, content, citations, created_at`), RLS "members manage own regway ai messages" (firm-scoped). No conversation grouping. |
| Read path | **None.** Nothing in `src/` or `supabase/functions/` reads this table. |
| `regway-ai-chat` | Sends the model **only the current message** (`messages: [{ role: 'user', … }]`). So even inside one open drawer, a follow-up ("what about the second one?") has no memory of the previous answer. History is written, never used. |
| `RegWayAICopilot.tsx` | `messages` state starts from `welcomeMessage()` on every mount; closing the drawer loses the conversation. Header has a non-functional "Export Memo" button (no handler; out of scope). Sidebar (firm/funds/companies) only renders at `xl` widths. |
| Streaming | `streamFunction` returns the raw SSE `Response`; CORS exposes no custom headers. |

## Design

1. **`regway_ai_conversations`** (`id, firm_id, user_id, title, context jsonb,
   created_at, updated_at`), RLS = the user's own conversations in their own
   firm; `regway_ai_messages.conversation_id` (cascade) + index. Older
   messages without a conversation stay as they are (not listed).
2. **The client names the conversation**: the drawer generates a UUID per
   new chat and sends it with each message, so the streaming response needs
   no extra header. The server creates the conversation on first use
   through the user's RLS-scoped client; an id belonging to someone else
   can neither be read nor claimed.
3. **Multi-turn memory, server-side**: the function loads the
   conversation's recent turns from the database (never trusts history from
   the client) and sends them before the new message, with a cache
   breakpoint on the history so long chats stay cheap.
4. **Context sticks to the conversation**: a resumed chat keeps the fund /
   company / regulation scope it started with (stored on the
   conversation), not whatever page it's reopened from.
5. **Title** = the first message, trimmed. No extra AI call.
6. **UI**: "History" (list of the user's recent conversations, any width)
   and "New chat" in the drawer header; resuming loads the messages,
   citations included.
