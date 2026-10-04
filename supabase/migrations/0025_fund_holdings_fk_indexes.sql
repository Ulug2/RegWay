-- Covering indexes for fund_holdings' composite foreign keys (flagged by the
-- Supabase performance advisor after 0024): a fund or company delete cascades
-- through (id, firm_id), so index exactly those column pairs. The company
-- index replaces 0024's single-column one, which it covers.

drop index if exists fund_holdings_company_idx;
create index fund_holdings_company_firm_idx on fund_holdings (portfolio_company_id, firm_id);
create index fund_holdings_fund_firm_idx on fund_holdings (fund_id, firm_id);
