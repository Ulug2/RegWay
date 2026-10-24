-- Matches the Skeptic hid, and putting one back (roadmap item 17a.1).
--
-- With SKEPTIC_MODE=on a match the Skeptic rejects is stored as
-- "NOT_RELEVANT: Reviewed: <the Skeptic's reason>" (_shared/verdictReview.ts)
-- and leaves the dashboard. The firm reads those rows already (its own
-- regulation_relevance rows); Profile → Hidden lists them.
--
-- Restoring one puts back the reason the matcher gave, which only
-- verdict_reviews holds (service role only, migration 0036). This function
-- hands that one value over for a row of the caller's own firm, and marks
-- the review restored_at: a rejection someone undid is a Skeptic mistake to
-- count when measuring it.

alter table verdict_reviews add column restored_at timestamptz;

create function restore_reviewed_match(p_relevance_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  rel regulation_relevance%rowtype;
  rel_scope text;
  rel_entity text;
  review verdict_reviews%rowtype;
begin
  select * into rel
  from regulation_relevance
  where id = p_relevance_id and firm_id = auth_firm_id();
  if not found or rel.relevance_reason not like 'NOT_RELEVANT: Reviewed: %' then
    raise exception 'not a match hidden by review' using errcode = 'P0002';
  end if;

  rel_scope := case when rel.portfolio_company_id is not null then 'company' when rel.fund_id is not null then 'fund' else 'firm' end;
  rel_entity := case rel_scope
    when 'company' then (select name from portfolio_companies where id = rel.portfolio_company_id)
    when 'fund' then (select name from funds where id = rel.fund_id)
  end;

  -- The rejection that hid it: a backfill review names the row; one made at
  -- matching time names the entity, so prefer the one naming this entity.
  select * into review
  from verdict_reviews v
  where v.firm_id = rel.firm_id
    and v.regulation_id = rel.regulation_id
    and v.decision = 'reject'
    and v.mode <> 'shadow'
    and (v.relevance_id = rel.id or (v.relevance_id is null and v.original ->> 'scope' = rel_scope))
  order by
    coalesce(v.relevance_id = rel.id, false) desc,
    lower(coalesce(v.original ->> 'entity_name', '')) = lower(coalesce(rel_entity, '')) desc,
    v.created_at desc
  limit 1;
  if not found then
    raise exception 'no review found for this match' using errcode = 'P0002';
  end if;

  update regulation_relevance set relevance_reason = review.original ->> 'reason' where id = rel.id;
  update verdict_reviews set restored_at = now() where id = review.id;
  return review.original ->> 'reason';
end;
$$;

revoke all on function restore_reviewed_match(uuid) from public, anon;
grant execute on function restore_reviewed_match(uuid) to authenticated;
