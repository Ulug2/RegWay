-- Fixes a real bug in 0017's storage write policies: the unqualified `name`
-- inside each EXISTS subquery silently resolved to `portfolio_companies.name`
-- (the company's business name) instead of the intended `storage.objects.name`
-- (the upload path), because `portfolio_companies` also has a `name` column
-- and Postgres resolves an unqualified column from the innermost scope first
-- — no ambiguity error, just a silently wrong reference. `storage.foldername`
-- of a business name (no slashes) returns an empty array, so the check always
-- failed, for every caller (confirmed via real project logs: an anonymous
-- test upload and a real signed-in user's upload failed identically).
-- Fix: qualify the outer table explicitly as `objects.name`.

drop policy "members upload own company logos" on storage.objects;
drop policy "members update own company logos" on storage.objects;
drop policy "members delete own company logos" on storage.objects;

create policy "members upload own company logos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'company-logos'
    and exists (
      select 1 from portfolio_companies pc
      where pc.id::text = (storage.foldername(objects.name))[1]
        and pc.firm_id = auth_firm_id()
    )
  );

create policy "members update own company logos" on storage.objects
  for update to authenticated using (
    bucket_id = 'company-logos'
    and exists (
      select 1 from portfolio_companies pc
      where pc.id::text = (storage.foldername(objects.name))[1]
        and pc.firm_id = auth_firm_id()
    )
  );

create policy "members delete own company logos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'company-logos'
    and exists (
      select 1 from portfolio_companies pc
      where pc.id::text = (storage.foldername(objects.name))[1]
        and pc.firm_id = auth_firm_id()
    )
  );
