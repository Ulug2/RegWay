-- Rate limiting for the three Edge Functions that call the Anthropic API on
-- behalf of a signed-in user (match-relevance, company-regulations,
-- harvey-chat). Signup itself is intentionally public, so without this any
-- user could rack up real API costs with no cap. Edge Functions are
-- stateless/ephemeral across invocations — an in-memory counter would not
-- reliably persist between requests — so the counter lives here in Postgres,
-- which every function already reaches.

create table rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  function_name text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_events_lookup_idx on rate_limit_events (user_id, function_name, created_at);

alter table rate_limit_events enable row level security;
-- Deliberately no policies for anon/authenticated — only service_role and
-- the SECURITY DEFINER function below may touch this table directly. A user
-- being able to read or (worse) delete their own rate-limit history would
-- defeat the point.

-- Reads auth.uid() internally rather than taking it as a parameter, so a
-- caller can never spoof another user's identity through this RPC. Uses an
-- advisory lock to serialize concurrent calls from the same user+function,
-- closing the race window a plain count-then-insert would leave open.
create or replace function check_rate_limit(p_function_name text, p_limit int, p_window_minutes int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count int;
begin
  if v_user_id is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_function_name, 0));

  select count(*) into v_count
  from rate_limit_events
  where user_id = v_user_id
    and function_name = p_function_name
    and created_at > now() - (p_window_minutes || ' minutes')::interval;

  if v_count >= p_limit then
    return false;
  end if;

  insert into rate_limit_events (user_id, function_name) values (v_user_id, p_function_name);
  return true;
end;
$$;

grant execute on function check_rate_limit(text, int, int) to authenticated;
