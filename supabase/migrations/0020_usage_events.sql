-- Per-call AI usage telemetry (tokens, cache hit/miss, web searches, an
-- estimated cost), written by every function that calls Anthropic. Built so
-- "why did we spend $X" is a direct query instead of exporting a CSV from
-- Anthropic's console and cross-referencing Supabase's own request logs by
-- hand (exactly what that investigation required before this existed).
--
-- Internal cost telemetry, not firm-scoped user-facing data — same
-- exposure model as `rate_limit_events`: RLS enabled, no policies, so only
-- the service role (the edge functions themselves) and direct DB access
-- (Supabase dashboard / MCP) can read or write it.

create table usage_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  function_name text not null,
  firm_id uuid references firms(id) on delete set null,
  model text not null,
  input_tokens integer not null default 0,
  cache_creation_input_tokens integer not null default 0,
  cache_read_input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  web_search_requests integer not null default 0,
  -- Anthropic list-price estimate computed at insert time (see
  -- _shared/usage.ts) — a real number for trend/spike-spotting, not a
  -- billing reconciliation; Anthropic's own invoice is authoritative.
  estimated_cost_usd numeric(10, 6) not null default 0,
  ok boolean not null default true
);

create index usage_events_created_at_idx on usage_events(created_at desc);
create index usage_events_function_name_idx on usage_events(function_name);

alter table usage_events enable row level security;
