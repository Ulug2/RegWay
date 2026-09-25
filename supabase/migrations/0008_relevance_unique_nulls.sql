-- The original unique constraint on (regulation_id, firm_id,
-- portfolio_company_id, fund_id) never actually deduplicated: portfolio_
-- company_id and fund_id are usually NULL, and Postgres treats NULLs as
-- distinct, so repeated upserts (or the model listing the same item twice in
-- one scan) inserted duplicate rows and the dashboard showed the same
-- headline twice. Remove existing duplicates, then enforce it with NULLS NOT
-- DISTINCT so upserts really do conflict.

delete from regulation_relevance a
using regulation_relevance b
where a.ctid > b.ctid
  and a.regulation_id = b.regulation_id
  and a.firm_id = b.firm_id
  and a.portfolio_company_id is not distinct from b.portfolio_company_id
  and a.fund_id is not distinct from b.fund_id;

create unique index regulation_relevance_unique_nulls_not_distinct
  on regulation_relevance (regulation_id, firm_id, portfolio_company_id, fund_id)
  nulls not distinct;
