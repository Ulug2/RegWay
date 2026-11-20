-- One analysis of a development per firm at a time. Writing an analysis
-- takes 30-70 s; until now a second request in that window (the matcher's
-- background job and a user opening the item, two users, two tabs) started
-- a second, paid AI call for the same analysis. The browser already avoided
-- this within one tab; the server did not.
--
-- A row here means "an analysis of this development for this firm is being
-- written". `generateImpact` (_shared/impact.ts) claims it before calling
-- the AI and removes it when done. A row older than the stale limit is from
-- an invocation the platform killed, and may be taken over.
--
-- `rerun`: a forced rewrite (after a profile edit or a re-check) asked while
-- another analysis was being written. That one may have read the old facts,
-- so whoever finishes it starts the forced rewrite.

create table regulation_impact_jobs (
  regulation_id uuid not null references regulations(id) on delete cascade,
  firm_id uuid not null references firms(id) on delete cascade,
  started_at timestamptz not null default now(),
  rerun boolean not null default false,
  primary key (regulation_id, firm_id)
);

-- Server only: no policies, so signed-in users see nothing.
alter table regulation_impact_jobs enable row level security;

-- True when the caller may write the analysis now. False when another
-- invocation is writing it; a forced request then marks it for a rerun.
create function claim_impact_job(p_regulation_id uuid, p_firm_id uuid, p_force boolean default false, p_stale_seconds integer default 300)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  -- Twice at most: the holder may finish between the insert and the update.
  for attempt in 1..2 loop
    insert into regulation_impact_jobs (regulation_id, firm_id)
    values (p_regulation_id, p_firm_id)
    on conflict (regulation_id, firm_id) do update
      set started_at = now(), rerun = false
      where regulation_impact_jobs.started_at < now() - make_interval(secs => p_stale_seconds);
    if found then
      return true;
    end if;
    if not p_force then
      return false;
    end if;
    update regulation_impact_jobs set rerun = true
    where regulation_id = p_regulation_id and firm_id = p_firm_id;
    if found then
      return false;
    end if;
  end loop;
  return false;
end
$$;

-- Removes the claim. Returns true when a forced rewrite was asked for while
-- it was held, so the caller starts one.
create function release_impact_job(p_regulation_id uuid, p_firm_id uuid)
returns boolean
language sql
set search_path = public
as $$
  with released as (
    delete from regulation_impact_jobs
    where regulation_id = p_regulation_id and firm_id = p_firm_id
    returning rerun
  )
  select coalesce((select rerun from released), false);
$$;

revoke all on function claim_impact_job(uuid, uuid, boolean, integer) from public, anon, authenticated;
grant execute on function claim_impact_job(uuid, uuid, boolean, integer) to service_role;
revoke all on function release_impact_job(uuid, uuid) from public, anon, authenticated;
grant execute on function release_impact_job(uuid, uuid) to service_role;
