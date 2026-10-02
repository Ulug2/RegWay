-- Finishes the Harvey -> RegWay AI rename (migration 0009's commit message
-- deliberately left the edge function slug `harvey-chat` and the table
-- `harvey_messages` unchanged at the time). Renames the table and its index;
-- Postgres preserves the RLS policy and its data across a table rename, but
-- the policy is recreated under a matching name for consistency since it's
-- cheap and keeps `\d regway_ai_messages` free of "harvey" too.

alter table harvey_messages rename to regway_ai_messages;
alter index harvey_messages_firm_id_idx rename to regway_ai_messages_firm_id_idx;

drop policy "members manage own harvey messages" on regway_ai_messages;
create policy "members manage own regway ai messages" on regway_ai_messages
  for all using (firm_id = auth_firm_id()) with check (firm_id = auth_firm_id());
