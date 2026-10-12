# Copilot: focus switching + chat sidebar (roadmap items 7 and 8)

## Prompt

> Go to next

## Audit

| Piece | State |
|---|---|
| Right panel | "Session Context" lists firm / funds / companies as plain text, `xl` only, not closable. |
| Scope | `AiContext` (fund / company / regulation) set from the page the drawer was opened on; a saved conversation's stored context wins on every later message, so it could never change. |
| History | Header "History" button opens an overlay over the chat; "New chat" also in the header. |
| Attachments | Shown as a chip above the input until sent, then only as a label on the message. |

## Design

1. Server: optional `refocus` (`{type:'firm'}` or `{type:'fund'|'company', id}`).
   Resolved through the user's RLS client (their firm's rows only, stored
   name), written to `regway_ai_conversations.context`, scope of matched
   developments follows, one-line note prefixed to that turn when there is
   earlier history. Unknown id → 404 before any AI call (and a conversation
   created by this message is removed).
2. Drawer: left sidebar (chats + New chat) behind a header toggle; right
   panel selectable and closable, with "Files in this chat"; a pending
   switch is shown above the input and sent once with the next message.
3. System prompt wording: "This conversation is focused on …" (was "opened
   this chat directly from …", wrong after a switch).
