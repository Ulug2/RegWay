-- Federal Register documents scheduled for a future issue (on public
-- inspection: filed, not yet published). The documents search already
-- returns them 1-3 days early, so sync-federal-register ingests them through
-- its normal feeds and sets this flag from the scheduled date; its
-- 30-minute re-sync clears the flag once the issue date arrives. The app
-- shows "Publishes <date>" instead of "Published", and the impact analysis
-- waits for the published text. (Comment updated after this was applied;
-- the SQL is unchanged.)

alter table regulations add column on_public_inspection boolean not null default false;
