# Live regulation monitoring, Phase 1 — investigate

Roadmap: `plans/regway-mvp-roadmap.md` → Priority order item 2.

## Prompt

> Okay go for the next item

## The real gap: matching never runs after onboarding

The roadmap frames this as "daily → every 30 minutes". The audit found a
bigger problem first. `match-relevance` and `match-enforcement-relevance`
are called from exactly one place, `OnboardingModal.tsx` (and the
geopolitical matcher also on dashboard load). Nothing schedules them. The
syncs keep adding regulations daily, but no existing firm ever has them
evaluated:

| Firm | Onboarded | Category | Evaluated | Arrived since onboarding |
|---|---|---|---|---|
| H.I.G. Capital | 09-30 | regulatory | **1** | 93 |
| Cartesian Capital Group | 09-29 | regulatory | 40 | 99 |
| Cartesian Capital Group | 09-29 | enforcement | 25 | 47 |
| Meridian Capital Partners (×2) | 09-20/21 | regulatory | 12 | 1,073 |

So firm and fund regulatory/enforcement pages are frozen at onboarding.
(Company pages get the weekly web-search scan, which is separate.)

## What exists

| Piece | State |
|---|---|
| Cron | Daily: Federal Register 11:00 UTC, SEC 11:15, SEC admin 11:30, FINRA 11:45, advisories 12:00. All call with the **publishable** key, which ships in the frontend bundle. Fine for syncs (idempotent, no AI). Not acceptable for anything that spends AI money. |
| Matchers | Each takes `{firmId}` with the service key (inside functions that key is the `sb_secret_…` key). Each looks at the newest 200 candidates of its category and evaluates up to 40 unevaluated per call; a call with nothing new makes no AI call. |
| Volume | Federal Register regulatory ≈ 4 documents/day (1,066 in 9 months), so steady-state matching is ≈ 1 AI batch per firm per day per matcher. The roadmap's regulatory pre-filter isn't needed for cost yet. |
| Federal Register sync at 30 min | Re-upserts a 7-day window each run (cheap), **but** re-fetches every OFAC notice's full text each time for countries: 48 runs/day × the week's notices. Needs to reuse stored countries. |
| Public inspection | `api/v1/public-inspection-documents/current.json` reachable: 108 docs, with type, agencies, `filed_at`, scheduled `publication_date`, same `document_number` as the later published version. No abstract. |
| Realtime | `supabase_realtime` publication is empty. |
| "New" badge | Nothing; `MatchedRegulation` has no match timestamp. |
| Vault | `supabase_vault` enabled, no secrets. |
| Outage visibility | `sync_runs` + dashboard banner keyed by source. |

## Scope for this pass (Phase 1a)

1. **`run-matching`**: one scheduled function that runs every firm's three
   matchers with the service key. Accepts only the service key. Skips
   entirely when nothing arrived since its last run and that run left no
   backlog, so a quiet half hour costs a couple of queries. Records each
   run in `sync_runs` (source `matching`) with structured stats, so an AI
   outage (e.g. out of credit) shows in the dashboard banner instead of
   pages silently going stale.
2. **Cron**: Federal Register sync every 30 min; `run-matching` every 30
   min, offset after it, authenticating with the service key read from
   Vault (never committed).
3. **Sync**: reuse stored countries for OFAC notices already ingested.
4. **Realtime** on `regulation_relevance` (RLS keeps firms apart) and the
   dashboard refreshing the open list when its firm's matches change.
5. **"New" badge**: items matched since the user's previous visit.

Deferred to Phase 1b, stated in the roadmap: public-inspection ingestion
(pre-publication items need their own status in the UI and the matchers),
the regulatory pre-filter (not needed at ≈4 items/day), and moving the
SEC/FINRA syncs off daily (SEC already returned a 429 once).

## Cost and the current blocker

First run clears a backlog: up to 200 regulatory + ~50 enforcement items per
firm, 40 per call, a few cents each, so roughly $1–2 across the 5 firms
once, then about one batch per firm per day per matcher. The Anthropic
account is out of credit, so until it's topped up every matching run will
fail and the banner will say so.
