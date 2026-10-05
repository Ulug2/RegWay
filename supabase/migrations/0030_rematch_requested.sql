-- Re-discovery after a profile edit (roadmap item 11).
--
-- When a firm, fund or company fact the matchers use changes, the matchers
-- forget their "not relevant" verdicts on recent items and re-check the
-- first batch at once. `requested_at` tells run-matching that an enrolled
-- firm has more to re-check, so the rest clears over the next scheduled
-- runs (run-matching otherwise skips when no new document arrived).
--
-- Set on enrolment too (the default), which already counted as work.

alter table scheduled_matching_firms add column requested_at timestamptz not null default now();
