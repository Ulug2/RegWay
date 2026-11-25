# Backend setup

## 1. Create the Supabase project

1. Go to https://supabase.com/dashboard and create a new project.
2. From **Project Settings → API**, copy the **Project URL** and **anon public key**.
3. Create `.env.local` in the repo root (copy `.env.example`) and paste those two values in as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

## 2. Get an Anthropic API key

1. Create a key at https://console.anthropic.com/settings/keys.
2. Do **not** put it in `.env.local` — it must never reach the browser. It only goes into Supabase's Edge Function secrets (next step).

## 3. Link the CLI and push the schema

For a **new** project:

```bash
supabase login
supabase link --project-ref <your-project-ref>   # found in the project URL / Settings → General
supabase db push                                  # applies every file in supabase/migrations/
```

**Not for RegWay's production project.** There, migrations from 0021 on
were applied by hand and are recorded by date, not by number, so
`supabase db push` would try to run 0021 onwards again. Apply each new
migration on its own (the dashboard's SQL editor, or `apply_migration`).

## 4. Set Edge Function secrets

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set RESEND_API_KEY=re_...        # email (Resend, regwayai.com domain)
supabase secrets set SKEPTIC_MODE=on CHAT_REVIEW=on
```

Optional: `ALERT_EMAIL_TO` (who gets the AI outage email; default
team@regwayai.com), `EMAIL_FROM` (default `RegWay <alerts@regwayai.com>`).
`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are
injected by Supabase; you don't set those yourself.

## 5. Deploy the functions

```bash
supabase functions deploy                  # every function
supabase functions deploy <name>           # one function
```

## 6. Do a first data sync

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/sync-federal-register" \
  -H "Authorization: Bearer <anon-key>"
```

The timers in the migrations keep it fresh after that (they read the
service key from Vault, see below).

## What each function does

The full story (pipeline, AI agents, emails, timers) is in
[`docs/regway-system-guide.md`](../docs/regway-system-guide.md). In short:

| Function | Who calls it | What it does | AI? |
|---|---|---|---|
| `sync-federal-register` | timer, 30 min | Federal Register rules for 64 agencies into `regulations` | no |
| `sync-regulator-feeds` | timer, 30 min | SEC/FTC/CFPB announcements, UK and EU regulators and sanctions | no |
| `sync-sec-enforcement` | timer, hourly | SEC litigation releases | no |
| `sync-finra-enforcement` | timer, hourly | FINRA bars, fines, suspensions | no |
| `sync-doj-press-releases` | timer, hourly | DOJ press releases about companies (settlements, antitrust, FCPA) | no |
| `sync-sec-admin-proceedings` | timer, 3 h | SEC administrative proceedings (PDF text read in code; Haiku headline; Sonnet for scans only) | yes |
| `sync-travel-advisories` | timer, 6 h | State Department advisories, levels 3 and 4 | no |
| `group-duplicates` | timer, 30 min | Links versions of one development | small |
| `run-matching` | timer, 30 min | Runs the three matchers for enrolled firms | via matchers |
| `match-relevance` | run-matching, onboarding, edits | Regulatory matches (Haiku) + the Skeptic | yes |
| `match-enforcement-relevance` | same | Enforcement matches | yes |
| `match-geopolitical-relevance` | same, dashboard load | Sanctions/trade/advisory matches by location + the Skeptic; fund rows from holdings | yes |
| `rematch-regulation` | user: "this match looks wrong" | Re-judges one development with the user's note | yes |
| `regulation-impact` | matchers, opening a development | Writes the analysis | yes |
| `refresh-entity-impacts` | after a profile edit | Rewrites analyses of an edited entity's matches | yes |
| `apply-profile-changes` | timer, 1 min | Runs the AI follow-up of profile edits once they settle | via others |
| `company-regulations` | the app, per company | Web-search scan for one portfolio company | yes |
| `research-firm` | after onboarding, "Research Again" | Web research on the firm, as proposals to confirm | yes |
| `regway-ai-chat` | the chat | Streams the answer, then checks its claims | yes |
| `review-existing-matches` | owner, by hand | Runs the Skeptic over existing matches | yes |
| `send-match-alerts` | timer, 30 min | Emails each person what newly matched | no |
| `ai-outage-email` | timer, 15 min | Emails the owner once when the AI keeps failing | no |

`ANTHROPIC_API_KEY` stays server-side only. The frontend never talks to
Anthropic directly.

## Scheduled matching (`run-matching`)

Every 30 minutes the Federal Register sync runs, and 10 minutes later
`run-matching` runs the three matchers for each firm enrolled in
`scheduled_matching_firms` (migrations 0026, 0029; today only H.I.G.). It
spends AI money, so it only accepts the service key, which its cron job
reads from Vault. Every job calls `private.call_function(name)` (migration
0050), which reads the project's address and service key from Vault and
calls nothing if either is missing, so a local database's jobs stay quiet.
Set both once per project (never in a migration):

```sql
select vault.create_secret('https://<project ref>.supabase.co', 'project_url');
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

## Web research on a firm (`research-firm`)

Runs after onboarding and from Profile → Suggested Facts. To run it for a
firm yourself (about $0.30–0.50; the result appears in that firm's Profile
for review):

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/research-firm" \
  -H "Authorization: Bearer <service key>" -H "apikey: <service key>" \
  -H "Content-Type: application/json" -d '{"firmId": "<firm id>"}'
```

Runs are in `firm_research_runs`, proposals in `firm_findings`; the calls in
`usage_events` under `research-firm:search` and `research-firm:extract`.

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
