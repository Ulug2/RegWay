-- The chat's stop button, as the server sees it (regway-ai-chat).
--
-- The browser stops reading the answer when the user presses stop, but the
-- closed connection does not reach the function through the platform's
-- gateway: a stopped answer kept running, was saved, and was checked (found
-- on 2026-10-17). The browser now also stamps the conversation when the
-- user stops, and the function watches for that stamp while it works.
--
-- Written by the conversation's owner under the existing policy ("users
-- manage own ai conversations").

alter table regway_ai_conversations add column stopped_at timestamptz;
