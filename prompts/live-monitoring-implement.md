# Live regulation monitoring, Phase 1a — implement

Follows `prompts/live-monitoring-investigate.md` (same prompt). Built the
Phase 1a scope as planned.

## What was built

| Piece | Where |
|---|---|
| `run-matching`: every firm × (regulatory, enforcement, geopolitical) matcher with the service key; skips when nothing arrived since its last run and no backlog remains; one batch per matcher per run; records the run in `sync_runs` (source `matching`) with `stats`; service key only | `supabase/functions/run-matching/index.ts` (new) |
| `sync_runs.stats`; Realtime on `regulation_relevance`; Federal Register sync every 30 min; `run-matching` at :10/:40 with the service key read from Vault | `supabase/migrations/0026_live_monitoring.sql` |
| `recordSyncRun` takes optional stats | `supabase/functions/_shared/syncRun.ts` |
| Sync reuses countries already read from an OFAC notice's full text (`raw.countries_from_full_text`), reports `fullTextReads` | `supabase/functions/sync-federal-register/index.ts` |
| `matched_at` on listed items; `subscribeToMatches` (Realtime, debounced); "Automatic matching" banner label | `src/lib/data.ts`, `src/lib/types.ts` |
| "New since your last visit": per user + firm, cut-off fixed per browser session | `src/lib/lastVisit.ts` (new) |
| Dashboard refreshes the open list on a match change; "New" badge on items | `src/components/Dashboard.tsx`, `src/components/EntityFeed.tsx` |

One-time setup (done on this project, documented in `supabase/README.md`):
`select vault.create_secret('<service key>', 'service_role_key');`

## Verification (live)

- `run-matching` with the publishable key: 401. The cron job's own SQL,
  executed once: pg_net 202, then a `sync_runs` row: 5 firms, 15 matcher
  calls, recorded `ok: false` with three de-duplicated errors — every
  matcher refused by Anthropic ("credit balance is too low"). So the whole
  chain (Vault key → run-matching → every matcher) works, and an AI outage
  surfaces in the dashboard banner as "Automatic matching". No AI was spent.
- Sync reuse: a 2-month window read 20 OFAC full texts on the first run and
  0 on the second.
- Browser (throwaway user and firm, deleted): a first visit shows no
  badges; a new session after a match was added shows 4 items with exactly
  1 "New".
- Realtime, from Deno signed in as the throwaway user (headless Chromium
  can't open a websocket to supabase.co through this container's proxy):
  subscribed to its own firm and to another throwaway firm; one insert each;
  only its own firm's row arrived (RLS holds on Realtime).

## Not verified

- Live matching results: blocked on Anthropic credit. Once topped up, the
  next :10/:40 run starts clearing the backlog (≈ $1–2 once across the 5
  firms, then about one batch per firm per matcher per day).
- The dashboard's live refresh in a browser (the subscription is verified
  from Deno; the refetch it triggers reuses the existing list fetches).

## Deferred (Phase 1b)

Public-inspection ingestion, a regulatory pre-filter (≈4 items/day doesn't
need one yet), and moving SEC/FINRA/advisory syncs off daily.
