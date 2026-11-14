-- Rename, pin and archive on a RegWay AI conversation (roadmap 16i).
--
-- pinned_at / archived_at are null when the conversation is neither pinned
-- nor archived. The history list reads pinned rows first, then the newest
-- unpinned ones that are not archived. Setting either stamp does not
-- change updated_at, so date groups stay where the last message left them.
--
-- The owner updates these columns under the existing policy "users manage
-- own ai conversations" (0028_ai_conversations.sql). That policy is FOR ALL
-- and has both USING and WITH CHECK on user_id and firm_id, so UPDATE is
-- already allowed and a row cannot be moved to another person.

alter table regway_ai_conversations
  add column pinned_at timestamptz,
  add column archived_at timestamptz;

-- The recent half of the history list: this user's unpinned, unarchived chats.
create index regway_ai_conversations_recent_idx
  on regway_ai_conversations (user_id, updated_at desc)
  where archived_at is null and pinned_at is null;

-- Every pinned chat, including ones older than the recent list.
create index regway_ai_conversations_pinned_idx
  on regway_ai_conversations (user_id, pinned_at desc)
  where archived_at is null and pinned_at is not null;
