# Implement: rate limiting for `match-relevance`, `company-regulations`, `harvey-chat`

You're working in the RegWay repo (`/Users/ulykbekkhairulla/dev/regpe`). Use
the findings from `prompts/11-rate-limiting-investigate.md`.

## Database

Create `supabase/migrations/0005_rate_limiting.sql`:

1. `rate_limit_events` table: `id bigint generated always as identity
   primary key`, `user_id uuid not null references auth.users(id) on
   delete cascade`, `function_name text not null`, `created_at timestamptz
   not null default now()`. Index on `(user_id, function_name,
   created_at)`. Enable RLS with **no policies granted to
   anon/authenticated** — only `service_role` and the `SECURITY DEFINER`
   function below should ever touch it directly.
2. A `check_rate_limit(p_function_name text, p_limit int, p_window_minutes
   int) returns boolean` function, `language plpgsql security definer set
   search_path = public`:
   - Reads `v_user_id := auth.uid()` internally — never take user_id as a
     parameter, so a caller can't spoof someone else's identity.
   - If `v_user_id is null`, return `false` (fail closed).
   - `perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':'
     || p_function_name, 0))` to serialize concurrent calls from the same
     user+function, closing the race window between counting and
     inserting.
   - Count rows in `rate_limit_events` for this user+function where
     `created_at > now() - (p_window_minutes || ' minutes')::interval`.
   - If count >= limit, return `false`. Otherwise insert a new row and
     return `true`.
   - `grant execute on function check_rate_limit(text, int, int) to
     authenticated;`

## Edge functions

In each of the three functions, call
`supabase.rpc('check_rate_limit', { p_function_name: '<name>', p_limit:
N, p_window_minutes: 60 })` using the **existing user-scoped client**
(the one built with the caller's own Authorization header — not a
service-role admin client), right before the first Anthropic API call. If
`data` comes back `false` (or there's an RPC error — fail closed, treat as
not allowed), return `json({ error: 'Rate limit exceeded. Please try again
later.' }, 429)`.

Limits (all per-user, 60-minute window — tune later if needed, these are a
single call-site argument each, not hardcoded deep in logic):
- `match-relevance`: `p_function_name: 'match-relevance'`, limit **15**.
  Place the check after the existing early-return checks (no candidates /
  nothing unevaluated) so no-op calls stay free. **Skip the check entirely
  on the service-role/cron path** — only apply it in the ordinary-user
  branch.
- `company-regulations`: `p_function_name: 'company-regulations'`, limit
  **15**. This function doesn't currently call `auth.getUser()` — it
  doesn't need to for this, since `auth.uid()` resolves server-side from
  the JWT already attached to the existing `supabase` client; just call
  the RPC through that client.
- `harvey-chat`: `p_function_name: 'harvey-chat'`, limit **30**.

## Verify

- `pnpm exec tsc --noEmit`.
- `supabase db push`, then `supabase functions deploy` for all three.
- Prove it actually works, not just that it deploys: from an authenticated
  browser session (`javascript_tool`, same pattern used throughout this
  project), call one of the functions in a tight loop past its limit and
  confirm the response flips to `429` with the expected error body once
  the limit is hit.
- Query `rate_limit_events` via psql to confirm rows are actually being
  recorded per call.
- Confirm a legitimate call still succeeds normally when under the limit
  (don't leave the test account rate-limited at the end — either wait out
  the window or delete the test rows via psql before finishing).
- Confirm `match-relevance`'s service-role/cron path (the one triggered by
  the scheduled sync-adjacent flow, or by passing the service role key
  directly) is unaffected by the limit.
