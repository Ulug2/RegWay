-- Daily caps on AI spending (security audit, roadmap 16g; Sidekick §17.3).
--
-- Every AI function a user can trigger limits each user per hour, but
-- sign-up is open: ten accounts could spend ten times as much, with no
-- ceiling. Before every AI call the server now asks this function whether
-- the last 24 hours' estimated spend (`usage_events`) has reached the
-- firm's cap or the cap for all of RegWay together, and refuses the call if
-- so. The caps themselves are function secrets (`_shared/ai/client.ts`), so
-- they can change without a migration.
--
-- Returns 'total', 'firm', or null when the call may go ahead. A rolling 24
-- hours, so a refused firm gets its calls back gradually, not at midnight.

create index usage_events_firm_created_idx on usage_events (firm_id, created_at desc);

create function ai_spend_check(p_firm_id uuid, p_firm_cap numeric, p_total_cap numeric)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when (select coalesce(sum(estimated_cost_usd), 0) from usage_events
          where created_at > now() - interval '24 hours') >= p_total_cap then 'total'
    when p_firm_id is not null
     and (select coalesce(sum(estimated_cost_usd), 0) from usage_events
          where firm_id = p_firm_id and created_at > now() - interval '24 hours') >= p_firm_cap then 'firm'
  end
$$;

revoke all on function ai_spend_check(uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function ai_spend_check(uuid, numeric, numeric) to service_role;
