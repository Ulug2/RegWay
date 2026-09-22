-- 0001_init.sql only gave `firms` and `firm_members` SELECT policies, which
-- made it impossible for a newly signed-up user to ever create their own
-- firm during onboarding (no INSERT policy = default deny under RLS).
--
-- Any authenticated user may create a new firm row (it starts with zero
-- members, so it's inert until claimed).
create policy "authenticated users can create a firm" on firms
  for insert to authenticated
  with check (true);

-- A user may only ever link themselves (never someone else) as a member,
-- and only to a firm that has no members yet — i.e. the one they just
-- created during onboarding. This blocks a user from linking themselves to
-- an arbitrary existing firm_id and reading that firm's data.
create policy "users can claim an unclaimed firm as themselves" on firm_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and not exists (select 1 from firm_members existing where existing.firm_id = firm_members.firm_id)
  );
