-- LexPulse core schema
-- Firms are the tenant boundary. Everything a PE firm owns (funds, portfolio
-- companies, notes, flags) is scoped to a firm via RLS. Regulations are
-- shared, public data fetched by backend jobs (Federal Register / EDGAR /
-- Claude web-search) and are readable by any signed-in user.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

create table firms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hq_location text,
  lead_gp_name text,
  jurisdictions text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Maps an auth.users row to the firm they belong to. One firm per user for v1.
create table firm_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  firm_id uuid not null references firms(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now()
);

create index firm_members_firm_id_idx on firm_members(firm_id);

-- ---------------------------------------------------------------------------
-- Fund architecture & portfolio companies
-- ---------------------------------------------------------------------------

create table funds (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  name text not null,
  size text,
  structure text,
  jurisdictions text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index funds_firm_id_idx on funds(firm_id);

create table portfolio_companies (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  name text not null,
  sectors text[] not null default '{}',
  regions text[] not null default '{}',
  hq_location text,
  aum text,
  offerings text,
  created_at timestamptz not null default now()
);

create index portfolio_companies_firm_id_idx on portfolio_companies(firm_id);

-- ---------------------------------------------------------------------------
-- Regulations (shared, public data)
-- ---------------------------------------------------------------------------

create table regulations (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('federal_register', 'sec_edgar', 'ai_search', 'manual')),
  external_id text,
  title text not null,
  agency text,
  jurisdiction text,
  summary text,
  published_date date,
  effective_date date,
  source_url text not null,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (source, external_id)
);

create index regulations_published_date_idx on regulations(published_date desc);
create index regulations_jurisdiction_idx on regulations(jurisdiction);

-- Links a regulation to the firm/fund/portfolio company it's relevant to.
-- Populated by the sync jobs (broad firm/fund matches) and by the on-demand
-- AI web-search agent (company-specific matches).
create table regulation_relevance (
  id uuid primary key default gen_random_uuid(),
  regulation_id uuid not null references regulations(id) on delete cascade,
  firm_id uuid not null references firms(id) on delete cascade,
  portfolio_company_id uuid references portfolio_companies(id) on delete cascade,
  fund_id uuid references funds(id) on delete cascade,
  relevance_reason text,
  created_at timestamptz not null default now(),
  unique (regulation_id, firm_id, portfolio_company_id, fund_id)
);

create index regulation_relevance_firm_id_idx on regulation_relevance(firm_id);
create index regulation_relevance_company_id_idx on regulation_relevance(portfolio_company_id);

-- ---------------------------------------------------------------------------
-- User-driven actions: flags & notes (never AI-assigned severity)
-- ---------------------------------------------------------------------------

create table regulation_flags (
  user_id uuid not null references auth.users(id) on delete cascade,
  regulation_id uuid not null references regulations(id) on delete cascade,
  firm_id uuid not null references firms(id) on delete cascade,
  flagged_at timestamptz not null default now(),
  primary key (user_id, regulation_id)
);

create table regulation_notes (
  id uuid primary key default gen_random_uuid(),
  regulation_id uuid not null references regulations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  firm_id uuid not null references firms(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index regulation_notes_regulation_id_idx on regulation_notes(regulation_id);

-- ---------------------------------------------------------------------------
-- Harvey AI conversation history
-- ---------------------------------------------------------------------------

create table harvey_messages (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb,
  created_at timestamptz not null default now()
);

create index harvey_messages_firm_id_idx on harvey_messages(firm_id, created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table firms enable row level security;
alter table firm_members enable row level security;
alter table funds enable row level security;
alter table portfolio_companies enable row level security;
alter table regulations enable row level security;
alter table regulation_relevance enable row level security;
alter table regulation_flags enable row level security;
alter table regulation_notes enable row level security;
alter table harvey_messages enable row level security;

-- Helper: the firm_id of the currently authenticated user.
create or replace function auth_firm_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select firm_id from firm_members where user_id = auth.uid()
$$;

create policy "members read own firm" on firms
  for select using (id = auth_firm_id());

create policy "members read own membership" on firm_members
  for select using (user_id = auth.uid());

create policy "members manage own funds" on funds
  for all using (firm_id = auth_firm_id()) with check (firm_id = auth_firm_id());

create policy "members manage own portfolio companies" on portfolio_companies
  for all using (firm_id = auth_firm_id()) with check (firm_id = auth_firm_id());

-- Regulations are public reference data: any signed-in user can read.
-- Writes only via service role (backend sync jobs), so no insert/update policy.
create policy "authenticated users read regulations" on regulations
  for select using (auth.role() = 'authenticated');

create policy "members read own relevance links" on regulation_relevance
  for select using (firm_id = auth_firm_id());

create policy "members manage own flags" on regulation_flags
  for all using (firm_id = auth_firm_id()) with check (firm_id = auth_firm_id());

create policy "members manage own notes" on regulation_notes
  for all using (firm_id = auth_firm_id()) with check (firm_id = auth_firm_id());

create policy "members manage own harvey messages" on harvey_messages
  for all using (firm_id = auth_firm_id()) with check (firm_id = auth_firm_id());
