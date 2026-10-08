-- Duplicate coverage (roadmap item 15).
--
-- The same development can be stored more than once: an agency's
-- announcement and the Federal Register document that follows it, the EU
-- Decision and Regulation for one sanctions action, a company scan's result
-- that is a document the Federal Register sync already holds.
--
-- `duplicate_of` points a later version at the first one (one level only:
-- the first version never points anywhere). Nothing is merged or deleted, so
-- a wrong link is undone by clearing the column. Lists show the first
-- version as the card and the others as "also published as" links.
--
-- `duplicates_checked_at`: when group-duplicates looked at the row, so each
-- row is compared once.

alter table regulations
  add column duplicate_of uuid references regulations (id) on delete set null,
  add column duplicates_checked_at timestamptz;

create index regulations_duplicate_of_idx on regulations (duplicate_of) where duplicate_of is not null;
-- The rows group-duplicates has still to look at.
create index regulations_duplicates_unchecked_idx on regulations (source, published_date) where duplicates_checked_at is null;

-- After the syncs (:00/:30 Federal Register, :05/:35 regulator feeds) and
-- before run-matching (:10/:40). Service key, like run-matching: one rule
-- makes small AI calls.
select cron.schedule(
  'group-duplicates-30min',
  '8,38 * * * *',
  $$
  select net.http_post(
    url := 'https://cfspwaqtidfliupmlfwz.supabase.co/functions/v1/group-duplicates',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), ''),
      'apikey', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), '')
    ),
    body := '{}'::jsonb
  );
  $$
);
