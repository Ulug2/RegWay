-- Whether RegWay's AI is working, for the dashboard.
--
-- The Anthropic credit ran out on 2026-10-08 and every AI call failed for
-- nine days (no matching, analyses, scans or chat) before anyone noticed.
-- Failed calls are now recorded in usage_events too (ok = false), with why
-- they failed in `error` ("credit: Anthropic API error: 400 …"; the part
-- before the colon is one of credit, auth, rate_limited, unavailable,
-- timeout, other; _shared/ai/client.ts).
--
-- ai_status() says whether the AI is failing now: at least three failed
-- calls since the last call that worked (looking back a week), why the
-- latest one failed, and since when. usage_events stays service-role only;
-- this function hands a signed-in user just those three values, which are
-- the same for every firm.

alter table usage_events add column error text;

create function ai_status()
returns table (failing boolean, reason text, since timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with last_ok as (
    select max(created_at) as at
    from usage_events
    where ok and created_at > now() - interval '7 days'
  ),
  failures as (
    select u.created_at, u.error
    from usage_events u, last_ok
    where not u.ok
      and u.created_at > now() - interval '7 days'
      and (last_ok.at is null or u.created_at > last_ok.at)
  )
  select
    count(*) >= 3,
    (select split_part(coalesce(f.error, 'other'), ':', 1) from failures f order by f.created_at desc limit 1),
    min(created_at)
  from failures;
$$;

revoke all on function ai_status() from public, anon;
grant execute on function ai_status() to authenticated;
