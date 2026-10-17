# Backend setup

## 1. Create the Supabase project

1. Go to https://supabase.com/dashboard and create a new project.
2. From **Project Settings → API**, copy the **Project URL** and **anon public key**.
3. Create `.env.local` in the repo root (copy `.env.example`) and paste those two values in as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

## 2. Get an Anthropic API key

1. Create a key at https://console.anthropic.com/settings/keys.
2. Do **not** put it in `.env.local` — it must never reach the browser. It only goes into Supabase's Edge Function secrets (next step).

## 3. Link the CLI and push the schema

```bash
supabase login
supabase link --project-ref <your-project-ref>   # found in the project URL / Settings → General
supabase db push                                  # applies supabase/migrations/0001_init.sql
```

## 4. Set Edge Function secrets

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically into Edge Functions by Supabase — you don't set those yourself.

## 5. Deploy the functions

```bash
supabase functions deploy sync-federal-register
supabase functions deploy match-relevance
supabase functions deploy sync-travel-advisories
supabase functions deploy match-geopolitical-relevance
supabase functions deploy company-regulations
supabase functions deploy regway-ai-chat
```

## 6. Do a first data sync

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/sync-federal-register" \
  -H "Authorization: Bearer <anon-key>"
```

This pulls the last 7 days of federal rules into the `regulations` table. To keep it fresh, schedule it from the Supabase dashboard (**Database → Cron**) to run daily, calling the same URL.

## What each function does

- `sync-federal-register` — pulls new/proposed federal rules from the free Federal Register API for a curated list of agencies (SEC, CFTC, IRS, DOL, EPA, FERC, HHS, FMCSA, CFPB) and upserts them as shared `regulations` rows. This is raw, unfiltered federal data — every firm's regulations still have to go through relevance matching below before anyone sees them.
- `match-relevance` — **the filter.** Takes a `firmId`, finds regulations not yet evaluated for that firm, and asks Claude (given that firm's real jurisdictions, funds, and portfolio companies) which ones actually create a compliance obligation or exposure, and for whom (the firm, a specific fund, or a specific portfolio company). Only regulations marked relevant get a `regulation_relevance` row; irrelevant ones get a `NOT_RELEVANT:` marker row so we don't re-ask about them every run. **The dashboard must always query through `regulation_relevance` (excluding rows whose `relevance_reason` starts with `NOT_RELEVANT:`), never straight from `regulations`** — that's what guarantees a firm never sees a regulation nothing has confirmed applies to them. Call this once right after onboarding (so a new firm isn't staring at an empty dashboard) and again after every `sync-federal-register` run. Regulatory category only: sanctions, export-control and trade documents from the same sync are `geopolitical` and go through `match-geopolitical-relevance`.
- `sync-travel-advisories` — pulls U.S. State Department travel advisories (levels 3-4 only) as `geopolitical` rows tagged with their countries. Runs daily (migration 0023).
- `match-geopolitical-relevance` — matches `geopolitical` items (OFAC, BIS, USTR, presidential sanctions/tariff documents, travel advisories) to the firm and its portfolio companies by recorded location: headquarters, facilities, operations, suppliers. A free pre-filter on `regulations.countries` runs first, so only items touching a country the firm is connected to reach Claude. Pass `{ "reevaluate": true }` after a location edit to re-check items rejected under the old footprint. Fund-level matches are not asked of Claude: every call re-derives them from `fund_holdings` (migration 0024, set on each company's profile card) plus the company verdicts (`_shared/holdings.ts`), as `regulation_relevance` rows with `via_holdings = true`. Call it with `{}` after a holdings edit.
- `company-regulations` — the on-demand version of the same idea, scoped to one portfolio company: given a `portfolio_company_id`, builds a query from that company's sector + location, asks Claude (with web search) to find recent relevant regulatory activity, forces the answer into a structured list, and stores each item as its own `regulations` row **already linked** via `regulation_relevance` — no separate matching step needed since it was already searched specifically for that company. This is what powers clicking into a company on the "Portfolio Companies" tab.
- `regway-ai-chat` — the conversational copilot. Loads the caller's firm/fund/portfolio context, asks Claude (with web search) to answer grounded in real sources, and saves the exchange to `regway_ai_messages`.

All four keep `ANTHROPIC_API_KEY` server-side only. The frontend never talks to Anthropic directly.

## Scheduled matching (`run-matching`)

Every 30 minutes the Federal Register sync runs, and 10 minutes later
`run-matching` runs the three matchers for each firm enrolled in
`scheduled_matching_firms` (migrations 0026, 0029; today only H.I.G.). It
spends AI money, so it only accepts the service key, which its cron job
reads from Vault. Set it once per project (never in a migration):

```sql
select vault.create_secret('<service key>', 'service_role_key');
```

Each run that does work is recorded in `sync_runs` with source `matching`;
a failing run shows on the dashboard as "Automatic matching". Run it by hand
with `{ "force": true }` and the service key. Enrol a firm with
`insert into scheduled_matching_firms (firm_id) values ('<firm id>')`.

## The Skeptic (`SKEPTIC_MODE`, `review-existing-matches`)

A second AI pass reviews every match the regulatory and geopolitical
matchers (and a user's re-check) mark relevant, and keeps, moves or rejects
it (roadmap item 17; `_shared/verdictReview.ts`). Each review is a row in
`verdict_reviews`. Set how much it does with a function secret:

```bash
supabase secrets set SKEPTIC_MODE=shadow   # review and record, change nothing
supabase secrets set SKEPTIC_MODE=on       # apply: rejected → "not relevant", moved → the right entity
supabase secrets unset SKEPTIC_MODE        # off (the default)
```

To measure it on a firm's existing matches first, call
`review-existing-matches` with the service key. Each call reviews up to 45
matches and changes nothing; repeat until `remaining` is 0:

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/review-existing-matches" \
  -H "Authorization: Bearer <service key>" -H "apikey: <service key>" \
  -H "Content-Type: application/json" -d '{"firmId": "<firm id>"}'
```

Read the results in the SQL editor:

```sql
select v.id, v.decision, r.title, v.original->>'scope' as was_on, v.original->>'entity_name' as was_entity,
       v.scope as now_on, v.entity_name as now_entity, v.original->>'reason' as matcher_reason, v.reason as review,
       v.unsupported_assumptions
from verdict_reviews v join regulations r on r.id = v.regulation_id
where v.firm_id = '<firm id>' and v.mode = 'backfill' and v.applied_at is null
order by v.decision, r.title;
```

Apply the ones you agree with, by id. A rejection hides the match, a move
puts it on the entity named, and a keep that depends on facts not recorded
adds them to the match's reason ("Depends on facts not recorded: …"); a
plain keep does nothing:

```bash
curl ... -d '{"firmId": "<firm id>", "apply": ["<review id>", "<review id>"]}'
```

To review the same matches again after the Skeptic's instructions change,
pass the time the new round started; only reviews made since then count as
done:

```bash
curl ... -d '{"firmId": "<firm id>", "since": "2026-10-17T21:00:00Z"}'
```

## The chat's answer check (`CHAT_REVIEW`)

When an answer claims that something applies (or doesn't) to the firm, a
fund or a company, `regway-ai-chat` checks the claims after the answer and
shows a short note under it (`regway-ai-chat/review.ts`). Other answers
cost one small extra call (the claim gate, about $0.001); a checked answer
about $0.02–0.04 more. Off by default:

```bash
supabase secrets set CHAT_REVIEW=on
supabase secrets unset CHAT_REVIEW
```

Every call is in `usage_events` under `regway-ai-chat/gate`,
`regway-ai-chat/skeptic` and `regway-ai-chat/citations`.
