-- The matchers read only the newest 200 documents of their kind. A document
-- that fell out of that window before it was judged (matching paused for a
-- while, or a burst of new documents) was never judged at all.
--
-- This returns the documents a matcher would have looked at but this firm
-- has no verdict on (no relevance row of any kind), newest first, among
-- those collected since the firm joined. The matchers use it to fill a batch
-- when their newest-200 window has fewer than a batch left to judge. "Since
-- the firm joined" keeps a new firm from being judged against the whole
-- archive: it still starts from the newest 200, as before.
--
-- The filters mirror each matcher's own query:
--   p_sources       only these sources (null: any)
--   p_skip_sources  never these sources (null: none)
--   p_countries     geopolitical: naming one of these countries (null: no
--                   country filter); p_include_global adds the documents
--                   that name none
--   p_exclude_ids   already in the caller's window

create function unjudged_regulations(
  p_firm_id uuid,
  p_category text,
  p_limit integer,
  p_sources text[] default null,
  p_skip_sources text[] default null,
  p_countries text[] default null,
  p_include_global boolean default false,
  p_exclude_ids uuid[] default '{}'
)
returns setof uuid
language sql
stable
set search_path = public
as $$
  select r.id
  from regulations r
  where r.category = p_category
    and r.created_at >= (select created_at from firms where id = p_firm_id)
    and (p_sources is null or r.source = any (p_sources))
    and (p_skip_sources is null or not (r.source = any (p_skip_sources)))
    and (p_countries is null or r.countries && p_countries or (p_include_global and r.countries = '{}'))
    and not (r.id = any (p_exclude_ids))
    and not exists (
      select 1 from regulation_relevance rr
      where rr.regulation_id = r.id and rr.firm_id = p_firm_id
    )
  order by r.published_date desc nulls last, r.id
  limit p_limit;
$$;

revoke all on function unjudged_regulations(uuid, text, integer, text[], text[], text[], boolean, uuid[]) from public, anon, authenticated;
grant execute on function unjudged_regulations(uuid, text, integer, text[], text[], text[], boolean, uuid[]) to service_role;
