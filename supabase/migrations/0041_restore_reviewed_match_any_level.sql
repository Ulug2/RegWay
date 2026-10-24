-- restore_reviewed_match (0040) found no review for a match stored on the
-- firm when the matcher had named a company the firm records under another
-- name ("Rheintal Batterie GmbH" for "Rheintal Batterie GmbH (test)"): the
-- name did not resolve, so the row went on the firm, while the review says
-- "company". The level now only ranks the candidates instead of ruling one
-- out; the review naming this row or entity still wins.

create or replace function restore_reviewed_match(p_relevance_id uuid)
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
  -- matching time names the entity, so prefer the one naming this entity,
  -- then the same level.
  select * into review
  from verdict_reviews v
  where v.firm_id = rel.firm_id
    and v.regulation_id = rel.regulation_id
    and v.decision = 'reject'
    and v.mode <> 'shadow'
    and (v.relevance_id = rel.id or v.relevance_id is null)
  order by
    coalesce(v.relevance_id = rel.id, false) desc,
    lower(coalesce(v.original ->> 'entity_name', '')) = lower(coalesce(rel_entity, '')) desc,
    v.original ->> 'scope' = rel_scope desc,
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

