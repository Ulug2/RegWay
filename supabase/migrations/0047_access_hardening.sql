-- Security audit (roadmap 16g), part 1: the database access rules.
--
-- 1. Joining another firm (critical). The rule that let a new user claim
--    the firm they had just created checked "this firm has no members yet"
--    with a query that itself ran under the access rules, so it saw only
--    the user's own memberships. Every firm looked unclaimed: anyone signed
--    in who knew a firm's id could add themselves to it and read
--    everything it holds. Now only the user who created a firm may claim
--    it, only while it has no members, and only if they belong to no firm.
--    The check runs in a function in a schema the API does not expose.
--
-- 2. One firm per user. Every query assumes it (`auth_firm_id()` returns a
--    single firm); now the database guarantees it.
--
-- 3. Columns members may change. A member could change any column of
--    their own rows, including the ones the server trusts: a firm's
--    `created_at` (which bounds how far back the matchers look), or which
--    fund or company a match belongs to (pointing it at another firm's).
--    Now they may change only what the app edits.
--
-- 4. Rows that point at other rows must point inside the member's own
--    firm (fund holdings) and at the member themselves (notes, flags, chat
--    messages).
--
-- 5. Defence in depth: nobody signed out can read or write any table;
--    signed-in users cannot touch the tables only the server uses; company
--    logos must be images of at most 2 MB.

-- 1 and 2 ------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

alter table firms add column created_by uuid default auth.uid() references auth.users (id) on delete set null;

-- True when the caller created this firm, nobody has claimed it yet, and
-- the caller belongs to no firm. Runs with the owner's rights so it sees
-- every membership, not only the caller's.
create function private.can_claim_firm(p_firm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (select 1 from public.firms f where f.id = p_firm_id and f.created_by = auth.uid())
    and not exists (select 1 from public.firm_members m where m.firm_id = p_firm_id)
    and not exists (select 1 from public.firm_members m where m.user_id = auth.uid())
$$;
revoke all on function private.can_claim_firm(uuid) from public;
grant execute on function private.can_claim_firm(uuid) to authenticated;

drop policy "users can claim an unclaimed firm as themselves" on firm_members;
create policy "users claim the firm they created" on firm_members
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_claim_firm(firm_id));

create unique index firm_members_one_firm_per_user on firm_members (user_id);

drop policy "authenticated users can create a firm" on firms;
create policy "users without a firm create one" on firms
  for insert to authenticated
  with check (created_by = (select auth.uid()) and auth_firm_id() is null);

-- 3 ------------------------------------------------------------------------

revoke insert, update on firms from authenticated;
grant insert (id, name, hq_location, lead_gp_name, jurisdictions, website, profile, profile_updated_at, profile_meta) on firms to authenticated;
grant update (name, hq_location, lead_gp_name, jurisdictions, website, profile, profile_updated_at, profile_meta) on firms to authenticated;

-- The app only hides and un-hides a match.
revoke insert, update on regulation_relevance from authenticated;
grant update (dismissed_at) on regulation_relevance to authenticated;

-- The app only accepts or rejects a finding.
revoke insert, update on firm_findings from authenticated;
grant update (status, decided_at) on firm_findings to authenticated;

-- 4 ------------------------------------------------------------------------

drop policy "members manage own fund holdings" on fund_holdings;
create policy "members manage own fund holdings" on fund_holdings
  for all to authenticated
  using (firm_id = (select auth_firm_id()))
  with check (
    firm_id = (select auth_firm_id())
    and exists (select 1 from funds f where f.id = fund_id and f.firm_id = fund_holdings.firm_id)
    and exists (select 1 from portfolio_companies c where c.id = portfolio_company_id and c.firm_id = fund_holdings.firm_id)
  );

drop policy "members manage own notes" on regulation_notes;
create policy "members manage own notes" on regulation_notes
  for all to authenticated
  using (firm_id = (select auth_firm_id()))
  with check (firm_id = (select auth_firm_id()) and user_id = (select auth.uid()));

drop policy "members manage own flags" on regulation_flags;
create policy "members manage own flags" on regulation_flags
  for all to authenticated
  using (firm_id = (select auth_firm_id()))
  with check (firm_id = (select auth_firm_id()) and user_id = (select auth.uid()));

-- A chat is private to the person who had it, like its conversation row.
drop policy "members manage own regway ai messages" on regway_ai_messages;
create policy "users manage own regway ai messages" on regway_ai_messages
  for all to authenticated
  using (firm_id = (select auth_firm_id()) and user_id = (select auth.uid()))
  with check (
    firm_id = (select auth_firm_id())
    and user_id = (select auth.uid())
    and (conversation_id is null or exists (
      select 1 from regway_ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid())
    ))
  );

-- `auth.role()` is deprecated; the role belongs in the policy's `to`.
drop policy "authenticated users read regulations" on regulations;
create policy "authenticated users read regulations" on regulations
  for select to authenticated using (true);

-- 5 ------------------------------------------------------------------------

-- The app requires sign-in for every table. The access rules already
-- returned nothing to a signed-out caller; now the tables refuse outright.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
-- Functions: Postgres lets everyone (`public`, which `anon` inherits from)
-- run a new function, so revoking from `anon` alone changes nothing.
-- Signed-in users get back only the four the app and the rules use.
revoke execute on all functions in schema public from public, anon;
grant execute on function auth_firm_id(), check_rate_limit(text, integer, integer),
  restore_reviewed_match(uuid), ai_status() to authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

-- Written and read only by the server (service key) or by functions that
-- run with the owner's rights.
revoke all on ai_outage_emails, match_alert_items, rate_limit_events, regulation_impact_jobs,
  scheduled_matching_firms, usage_events, verdict_reviews from authenticated;

-- The browser already refuses anything but an image under 2 MB; now the
-- bucket does too. No SVG: it can carry script.
update storage.buckets
set file_size_limit = 2 * 1024 * 1024,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
where id = 'company-logos';
