-- Corrects the sync-federal-register-daily schedule from 0003. It was set
-- to 07:00 UTC, which is 3am US Eastern (this project's actual operating
-- timezone, confirmed via system check) rather than the intended 7am
-- Eastern. Updates to 11:00 UTC, which matches 7am EDT (daylight saving,
-- currently in effect).
--
-- Eastern shifts to UTC-5 (EST) in November — this will then run at 8am
-- Eastern until manually adjusted back to 12:00 UTC. pg_cron schedules run
-- in the database's fixed UTC timezone with no DST awareness; accepted as
-- a fine tradeoff for a twice-daily-adjusted data-freshness job rather than
-- building automatic DST handling for an MVP.

select cron.alter_job(
  (select jobid from cron.job where jobname = 'sync-federal-register-daily'),
  schedule := '0 11 * * *'
);
