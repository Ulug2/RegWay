-- Fund → portfolio company holdings (roadmap Priority order item 1.1; spec
-- §3, §9, §13). Which of the firm's funds holds which of its companies. Many
-- to many: co-investments and continuation funds put one company in several
-- funds. Only ever user-entered; spec §3 forbids inferring ownership.
--
-- The composite foreign keys make a cross-firm holding impossible whatever a
-- client sends: the fund and the company must both belong to `firm_id`.

alter table funds add constraint funds_id_firm_id_key unique (id, firm_id);
alter table portfolio_companies add constraint portfolio_companies_id_firm_id_key unique (id, firm_id);

create table fund_holdings (
  fund_id uuid not null,
  portfolio_company_id uuid not null,
  firm_id uuid not null references firms(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (fund_id, portfolio_company_id),
  foreign key (fund_id, firm_id) references funds (id, firm_id) on delete cascade,
  foreign key (portfolio_company_id, firm_id) references portfolio_companies (id, firm_id) on delete cascade
);

-- The primary key covers lookups by fund; these cover by company (the
-- company card, the cascade from a company delete) and by firm (RLS, the
-- matcher's per-firm load).
create index fund_holdings_company_idx on fund_holdings (portfolio_company_id);
create index fund_holdings_firm_idx on fund_holdings (firm_id);

alter table fund_holdings enable row level security;

create policy "members manage own fund holdings" on fund_holdings
  for all using (firm_id = (select auth_firm_id())) with check (firm_id = (select auth_firm_id()));

-- A fund-level relevance row derived from holdings ("the fund holds a
-- company with a supported connection") rather than from a verdict about
-- the fund itself. Marked so it can be recomputed whenever holdings or the
-- underlying company verdicts change, without touching direct verdicts.
alter table regulation_relevance add column via_holdings boolean not null default false;
