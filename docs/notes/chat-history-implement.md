# Copilot: save and resume chats — implement

Follows `docs/notes/chat-history-investigate.md` (same prompt). Built as
designed.

## What was built

| Piece | Where |
|---|---|
| `regway_ai_conversations` (personal, RLS = own user + own firm), `regway_ai_messages.conversation_id` (cascade) + indexes | `supabase/migrations/0028_ai_conversations.sql` |
| `conversationId` per chat; conversation opened/created through the user's RLS client (someone else's id → 404 before any AI call); stored scope wins; last 20 messages (≤ 24K chars) sent to the model with a cache breakpoint; exchange saved to the conversation | `supabase/functions/regway-ai-chat/index.ts` |
| `fetchConversations`, `fetchConversationMessages`, `deleteConversation` | `src/lib/data.ts` |
| History panel (recent 30, delete) | `src/components/ConversationHistory.tsx` (new) |
| "History" / "New chat" in the drawer header; resume loads messages and the conversation's scope | `src/components/RegWayAICopilot.tsx` |

## Verification (live, throwaway users/firms, deleted)

- Two messages in one conversation: "My favourite colour is teal" →
  "What is my favourite colour?" answered "Teal." (memory works; it didn't
  before, every message was sent alone).
- Second message read 2,112 cached tokens: $0.0021 vs $0.0090 for the first.
- A second user posting into the first user's conversation id: 404
  "Conversation not found", no AI call; they see 0 conversations and 0 of
  its messages.
- Browser: History lists the conversation (title, time); choosing it shows
  all four turns.
- Spend for this pass: $0.011.

## Notes

- `regway_ai_messages` keeps its firm-wide RLS policy, so in a future
  multi-user firm, colleagues could read each other's chat messages (not
  the conversation list). Tighten to `user_id` when multi-user firms land.
- The header's "Export Memo" button has no handler (pre-existing).
