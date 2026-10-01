-- `sync-sec-admin-proceedings` (SEC's PDF-based administrative proceedings)
-- was found to hang indefinitely rather than fail fast when the SEC feed is
-- unreachable or rate-limiting (observed during testing; root cause
-- unconfirmed — needs edge-function log access this session didn't have).
-- Unscheduling rather than leaving a known-unreliable job running daily
-- unattended. SEC litigation releases and FINRA enforcement (the other two
-- enforcement sources) are unaffected and stay scheduled.

select cron.unschedule('sync-sec-admin-proceedings-daily');
