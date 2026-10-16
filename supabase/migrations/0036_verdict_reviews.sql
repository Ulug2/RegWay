-- The Skeptic's reviews of matches (roadmap item 17).
--
-- Every match a matcher marks relevant can be reviewed by a second, separate
-- AI pass (_shared/roles/skeptic.ts) that keeps it, moves it to the entity
-- it really rests on, or rejects it (_shared/verdictReview.ts). Each review
-- is recorded here, whether or not it was applied: the audit trail of why a
-- match was changed, and the data for measuring the Skeptic before it is
-- trusted.
--
-- mode: 'shadow' reviewed but not applied; 'on' applied at matching time;
-- 'backfill' a review of an existing match by review-existing-matches,
-- applied only when the owner approves it (applied_at).
--
-- Internal, like usage_events: RLS on and no policies, so only the service
-- role reads or writes it.

create table verdict_reviews (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms (id) on delete cascade,
  regulation_id uuid not null references regulations (id) on delete cascade,
  -- The stored match a backfill review is about.
  relevance_id uuid references regulation_relevance (id) on delete set null,
  function_name text not null,
  mode text not null check (mode in ('shadow', 'on', 'backfill')),
  -- The verdict as the matcher gave it: {scope, entity_name, reason}.
  original jsonb not null,
  decision text not null check (decision in ('keep', 'move', 'reject', 'failed')),
  -- Where the match stands after the review; null when the review failed.
  scope text check (scope in ('firm', 'fund', 'company')),
  entity_name text,
  reason text not null default '',
  unsupported_assumptions text[] not null default '{}',
  model text not null,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);

create index verdict_reviews_firm_idx on verdict_reviews (firm_id, created_at desc);
create index verdict_reviews_regulation_idx on verdict_reviews (regulation_id);
create index verdict_reviews_relevance_idx on verdict_reviews (relevance_id);

alter table verdict_reviews enable row level security;

-- The chat's check of an answer that claims something applies to the firm
-- (phase 4 of item 17): {status, notes}, shown under the answer and when the
-- conversation is reopened. Null when no check ran.
alter table regway_ai_messages add column review jsonb;
