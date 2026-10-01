-- Portfolio company logo upload. Logos aren't sensitive, so the bucket is
-- public for reads (simplest — no signed URLs needed to render them);
-- writes are restricted to members of the firm that owns the company, keyed
-- by the company id being the first path segment of the object name
-- (`{company_id}/...`).

alter table portfolio_companies add column logo_url text;

insert into storage.buckets (id, name, public)
values ('company-logos', 'company-logos', true)
on conflict (id) do nothing;

create policy "public read company logos" on storage.objects
  for select using (bucket_id = 'company-logos');

create policy "members upload own company logos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'company-logos'
    and exists (
      select 1 from portfolio_companies pc
      where pc.id::text = (storage.foldername(name))[1]
        and pc.firm_id = auth_firm_id()
    )
  );

create policy "members update own company logos" on storage.objects
  for update to authenticated using (
    bucket_id = 'company-logos'
    and exists (
      select 1 from portfolio_companies pc
      where pc.id::text = (storage.foldername(name))[1]
        and pc.firm_id = auth_firm_id()
    )
  );

create policy "members delete own company logos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'company-logos'
    and exists (
      select 1 from portfolio_companies pc
      where pc.id::text = (storage.foldername(name))[1]
        and pc.firm_id = auth_firm_id()
    )
  );
