-- 0001_init.sql only gave `firms` a SELECT policy, and 0002 added INSERT
-- (for onboarding). Nothing lets a member update their own firm's fields
-- (e.g. the Profile screen editing lead_gp_name) — add that here.

create policy "members update own firm" on firms
  for update using (id = auth_firm_id()) with check (id = auth_firm_id());
