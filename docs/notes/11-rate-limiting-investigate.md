# Investigate: rate limiting for `match-relevance`, `company-regulations`, `harvey-chat`

You're working in the RegWay repo (`/Users/ulykbekkhairulla/dev/regpe`). This
is a **read-only investigation pass** — do not edit anything yet.

Context: these three Edge Functions all call the Anthropic API on behalf of
any signed-up user (signup itself is intentionally public), so a user could
rack up real API costs with no cap today. Edge Functions are stateless/
ephemeral across invocations — an in-memory counter would not reliably
persist between requests (may hit a different isolate) — so rate-limit
state needs to live in Postgres, which every function already has access to
via a service-role admin client.

## Steps

1. Read all three functions in full
   (`supabase/functions/match-relevance/index.ts`,
   `supabase/functions/company-regulations/index.ts`,
   `supabase/functions/harvey-chat/index.ts`) and note, for each, the exact
   point where the caller's `user.id` becomes known (after the
   `auth.getUser()` / membership lookup) — that's where a rate-limit check
   needs to be inserted, before the expensive Anthropic call(s) happen.
   Note `match-relevance` has a second auth path (service-role/cron caller
   with an explicit `firmId`) — confirm whether that path should be
   rate-limited too or is exempt (it's the trusted admin/cron path, not an
   end-user-triggered one).
2. Confirm there's no existing rate-limiting table/mechanism already in the
   schema (`supabase/migrations/*.sql`) or in `supabase/functions/_shared/`
   — check before assuming a clean build.
3. Confirm the existing pattern for shared helpers
   (`supabase/functions/_shared/cors.ts`) so a new rate-limit helper follows
   the same style/import convention already used by all four functions.
4. Work out realistic default limits by reasoning about each function's
   actual cost/usage shape (not just picking arbitrary numbers):
   - `harvey-chat`: conversational, one Claude call with web search per
     message — a legitimate user might send many messages while exploring.
   - `company-regulations`: two Claude calls (search + structured
     extraction) per invocation, but results are cached per company after
     the first successful run — so repeat legitimate clicks on the same
     company shouldn't even reach Claude again (verify this caching
     behavior is actually true by re-reading the function and
     `src/lib/data.ts`'s `fetchCompanyRegulations`/Dashboard's
     `selectCompany` logic).
   - `match-relevance`: batches up to 40 unevaluated regulations per call
     and skips anything already evaluated — also naturally self-limiting on
     repeat calls with no new data (returns `evaluated: 0` immediately).
5. Decide on a concrete, simple Postgres design: a single shared
   `rate_limit_events` table (user_id, function_name, created_at) plus one
   `SECURITY DEFINER` Postgres function that atomically checks-and-records
   (using an advisory lock keyed on user_id+function_name to close the
   race-condition window between "check count" and "insert new row" — a
   plain count-then-insert without locking would let concurrent requests
   from the same user both pass the check before either is recorded).

## Output

Confirmed injection points per function (file + line), confirmed no prior
rate-limiting exists, the exact shared-helper style to match, and concrete
per-function limit/window numbers with the reasoning behind each — ready to
implement without further research.
