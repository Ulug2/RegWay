-- Monthly spend caps and a reserve for people (Sidekick §17.3; system guide
-- §12). Migration 0048 capped the last 24 hours only, and answered with the
-- verdict. The server now reads the four totals it needs and decides in
-- code (`_shared/ai/client.ts`), where the caps, the monthly ones and the
-- share kept back for click-started work are function secrets:
--
--   firm_day / total_day      the last 24 hours, for this firm / everyone
--   firm_month / total_month  since the start of this calendar month (UTC)
--
-- A null firm (work done for no firm, such as grouping duplicates) has
-- firm totals of 0. `ai_spend_check` (0048) stays until every function is
-- deployed with this version; a later migration drops it.

create function ai_spend_totals(p_firm_id uuid)
returns table (firm_day numeric, total_day numeric, firm_month numeric, total_month numeric)
language sql
stable
set search_path = public
as $$
  with bounds as (
    select now() - interval '24 hours' as day_start,
           date_trunc('month', now() at time zone 'UTC') at time zone 'UTC' as month_start
  ),
  recent as (
    select u.firm_id, u.estimated_cost_usd as cost, u.created_at
    from usage_events u, bounds b
    where u.created_at >= least(b.day_start, b.month_start)
  )
  select
    coalesce(sum(r.cost) filter (where r.firm_id = p_firm_id and r.created_at > b.day_start), 0),
    coalesce(sum(r.cost) filter (where r.created_at > b.day_start), 0),
    coalesce(sum(r.cost) filter (where r.firm_id = p_firm_id and r.created_at >= b.month_start), 0),
    coalesce(sum(r.cost) filter (where r.created_at >= b.month_start), 0)
  from bounds b left join recent r on true
  group by b.day_start, b.month_start
$$;

revoke all on function ai_spend_totals(uuid) from public, anon, authenticated;
grant execute on function ai_spend_totals(uuid) to service_role;
