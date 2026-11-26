-- Possible matches: answering the one question a match turns on.
--
-- A judge that finds a document would apply to an entity only if one
-- unrecorded fact is true saves it as not relevant, with that fact as a
-- yes/no question in front of its reason (_shared/possibleMatch.ts):
--
--   NOT_RELEVANT: Possible: Does A.L.A. S.p.A. ship defense articles?
--   <what the document would require of it if so>
--
-- The dashboard lists those apart. A member's answer:
-- - is saved to the entity's other facts (profile.notes), which every
--   matcher reads, so later documents are judged on it;
-- - turns every possible match of that entity on the same question into a
--   match (yes) or a plain rejection (no), with the answer in its reason.
--
-- Members may already edit these profiles (0047); this hands over the one
-- change to regulation_relevance they could not make themselves. Nothing
-- here calls the AI.

create function answer_possible_match(p_relevance_id uuid, p_yes boolean)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  prefix constant text := 'NOT_RELEVANT: Possible: ';
  rel regulation_relevance%rowtype;
  question text;
  fact text;
  answered int;
begin
  select * into rel
  from regulation_relevance
  where id = p_relevance_id and firm_id = auth_firm_id();
  if not found or not starts_with(rel.relevance_reason, prefix) then
    raise exception 'not a possible match' using errcode = 'P0002';
  end if;

  question := split_part(substr(rel.relevance_reason, length(prefix) + 1), E'\n', 1);
  fact := question || case when p_yes then ' Yes.' else ' No.' end;

  update regulation_relevance r
  set relevance_reason = case
    when p_yes then substr(r.relevance_reason, length(prefix || question) + 2) || ' (Confirmed by the firm: ' || fact || ')'
    else 'NOT_RELEVANT: Answered: ' || fact || ' ' || substr(r.relevance_reason, length(prefix || question) + 2)
  end
  where r.firm_id = rel.firm_id
    and r.fund_id is not distinct from rel.fund_id
    and r.portfolio_company_id is not distinct from rel.portfolio_company_id
    and starts_with(r.relevance_reason, prefix || question || E'\n');
  get diagnostics answered = row_count;

  -- The answer, as one of the entity's other facts (once).
  if rel.portfolio_company_id is not null then
    update portfolio_companies
    set profile = jsonb_set(profile, '{notes}', coalesce(profile -> 'notes', '[]'::jsonb) || to_jsonb(fact)),
        profile_meta = jsonb_set(profile_meta, '{notes}', jsonb_build_object('source', 'user', 'confirmed_at', now())),
        profile_updated_at = now()
    where id = rel.portfolio_company_id and not coalesce(profile -> 'notes', '[]'::jsonb) ? fact;
  elsif rel.fund_id is not null then
    update funds
    set profile = jsonb_set(profile, '{notes}', coalesce(profile -> 'notes', '[]'::jsonb) || to_jsonb(fact)),
        profile_meta = jsonb_set(profile_meta, '{notes}', jsonb_build_object('source', 'user', 'confirmed_at', now())),
        profile_updated_at = now()
    where id = rel.fund_id and not coalesce(profile -> 'notes', '[]'::jsonb) ? fact;
  else
    update firms
    set profile = jsonb_set(profile, '{notes}', coalesce(profile -> 'notes', '[]'::jsonb) || to_jsonb(fact)),
        profile_meta = jsonb_set(profile_meta, '{notes}', jsonb_build_object('source', 'user', 'confirmed_at', now())),
        profile_updated_at = now()
    where id = rel.firm_id and not coalesce(profile -> 'notes', '[]'::jsonb) ? fact;
  end if;

  return answered;
end;
$$;

revoke execute on function answer_possible_match(uuid, boolean) from public, anon;
grant execute on function answer_possible_match(uuid, boolean) to authenticated;
