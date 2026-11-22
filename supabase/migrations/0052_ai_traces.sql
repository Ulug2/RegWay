-- What each AI call was told and what it answered, kept 30 days (Sidekick
-- §17.9). `usage_events` records what a call cost and `verdict_reviews`
-- what the Skeptic decided, but not what the judge was sent: when a match is
-- wrong, nobody could see why. Written by `_shared/ai/client.ts` after every
-- non-streamed call made with a usage target (the chat's streamed answer is
-- kept in its messages instead).
--
-- Holds firm profiles and document text: RLS on, no policies, so only the
-- service role (the functions) and direct database access read it, as with
-- `usage_events`. A firm's traces go when the firm does. No key or token is
-- ever in a request body (they travel in headers, which are not stored).

create table ai_traces (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  function_name text not null,
  firm_id uuid references firms(id) on delete cascade,
  model text not null,
  -- The request as sent (instructions, tools, messages), with long values
  -- such as an attached PDF shortened.
  request jsonb not null,
  -- The answer's content blocks and stop reason; null when the call failed.
  response jsonb,
  ok boolean not null default true,
  error text
);

create index ai_traces_created_at_idx on ai_traces (created_at desc);
create index ai_traces_firm_function_idx on ai_traces (firm_id, function_name, created_at desc);

alter table ai_traces enable row level security;
revoke all on table ai_traces from anon, authenticated;

-- Kept 30 days.
select cron.schedule('ai-traces-30-days', '40 3 * * *', $$delete from public.ai_traces where created_at < now() - interval '30 days'$$);
