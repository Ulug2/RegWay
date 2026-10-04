-- Which firms scheduled matching (`run-matching`) runs for.
--
-- Scheduled matching spends AI money per firm on every run with new
-- developments, so it covers only firms listed here rather than every firm
-- that ever signed up (roadmap item 9: only match firms that are in use).
-- Firms not listed are still matched at onboarding and the geopolitical
-- matcher still runs when their dashboard loads; they just don't get
-- background matching.
--
-- Its own table rather than a column on `firms`: firm members may update
-- their firm's row, and this flag spends money. RLS is on with no policies,
-- so only the service role can read or change it.
--
--   insert into scheduled_matching_firms (firm_id) values ('<firm id>');
--   delete from scheduled_matching_firms where firm_id = '<firm id>';

create table scheduled_matching_firms (
  firm_id uuid primary key references firms (id) on delete cascade,
  enabled_at timestamptz not null default now()
);

alter table scheduled_matching_firms enable row level security;
