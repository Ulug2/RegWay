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
- `match-geopolitical-relevance` — matches `geopolitical` items (OFAC, BIS, USTR, presidential sanctions/tariff documents, travel advisories) to the firm and its portfolio companies by recorded location: headquarters, facilities, operations, suppliers. A free pre-filter on `regulations.countries` runs first, so only items touching a country the firm is connected to reach Claude. Pass `{ "reevaluate": true }` after a location edit to re-check items rejected under the old footprint. Fund-level matches wait on a fund → company holdings relationship (roadmap Priority order item 1).
- `company-regulations` — the on-demand version of the same idea, scoped to one portfolio company: given a `portfolio_company_id`, builds a query from that company's sector + location, asks Claude (with web search) to find recent relevant regulatory activity, forces the answer into a structured list, and stores each item as its own `regulations` row **already linked** via `regulation_relevance` — no separate matching step needed since it was already searched specifically for that company. This is what powers clicking into a company on the "Portfolio Companies" tab.
- `regway-ai-chat` — the conversational copilot. Loads the caller's firm/fund/portfolio context, asks Claude (with web search) to answer grounded in real sources, and saves the exchange to `regway_ai_messages`.

All four keep `ANTHROPIC_API_KEY` server-side only. The frontend never talks to Anthropic directly.
