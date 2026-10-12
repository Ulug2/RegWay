# Geopolitical Phase 1 recheck — implement

Follows `docs/notes/geopolitical-phase1-recheck-investigate.md` (same prompt).

Decisions asked and answered mid-pass:
- Delete the 60 URL-keyed `state_travel_advisories` rows and re-sync under
  the new key: **yes** (0 relevance rows / impacts referenced them).
- Regenerate the blind `C1-2026-18574` impact analysis for Cartesian:
  **yes**, but not done. On inspection its only relevance row for
  Cartesian is now `NOT_RELEVANT`, so the analysis is an orphan no screen
  shows; regenerating it would analyse a match that doesn't exist. Left in
  place and reported.

## What was built

| Piece | Where |
|---|---|
| A response that ended on `unblock.federalregister.gov` is a failed fetch (no retry), so the next candidate runs | `_shared/text.ts` |
| One list of a Federal Register document's text URLs: FR `.txt` → GovInfo `.htm` → FR HTML | `_shared/federalRegister.ts` (new), used by `sync-federal-register` and `_shared/impact.ts` |
| Country of the sanctions program an OFAC notice's authority line cites (E.O. → country; program-wide orders map to nothing) | `_shared/sanctionsPrograms.ts` (new), used by `sync-federal-register` |
| CDATA unwrapped before tag stripping | `_shared/rss.ts` |
| Advisory rows keyed by countries + level, not URL; summary skips the leading change note | `sync-travel-advisories/index.ts` |
| `Cote d Ivoire`, `Republic of Congo` aliases (the feed's spellings) | `_shared/countries.ts` |
| Presidential topic filter: `importation`, `duty`, Trading With the Enemy Act, customs, de minimis | `sync-federal-register/index.ts` |
| Matcher prompt: designation notices carry the program country; foreign facilities alone are not import activity | `match-geopolitical-relevance/index.ts` |

## Verification (live, project cfspwaqtidfliupmlfwz)

- **Fallback on real documents** (from this container, where every
  federalregister.gov document URL 302s to the unblock page): OFAC notices
  2026-20215 / 2026-19488, correction C1-2026-18574 and proclamation
  2026-14334 all come back as GovInfo text. A stubbed block-page response
  is skipped after one request (no retry) and the CAPTCHA text never
  reaches the caller.
- **All 13 functions redeployed with the CLI** (`supabase functions deploy
  --use-api`), so production matches the repo, including the six still on
  the pre-`ad0265a` shared code.
- **Backfill** (`since=2026-01-04`): 1,303 synced, 251 geopolitical.
  Presidential documents 59 → 67 (exactly the 8 the wider filter adds).
  Country-less SDN notices 46 → 32: 13 now Iran, 1 Mali + Iran; the 32
  left cite only program-wide authorities (13224, 13382, 13581, 13694) or
  none, which matches the GovInfo probe.
- **Matcher** on H.I.G. after the backfill: first run marked the global
  de minimis suspension relevant to 3Pillar and A.L.A. on "could affect …
  if it imports …, though import activities are not recorded". Rule added,
  those test verdicts and the one impact they spawned deleted, re-run: all
  4 new items not relevant, each citing the missing supplier/import data.
  The two pre-existing matches are unchanged.
- **RSS change is safe for the other feeds**: SEC litigation releases and
  FINRA re-synced on Supabase, all 38 stored rows byte-identical (title and
  summary hashes). One SEC call got a transient 429 (its daily runs are
  fine); the retry succeeded, so the dashboard's failing-source banner
  isn't left on.
- **Advisories**: 60 rows → 53, one per country + level; a second run kept
  53; no summary starts with the change note or mid-sentence.

## Found, not fixed (noted in the roadmap)

- `finraNotices` hits the 20-page cap on a 9-month backfill (SEC NOTICE
  volume); daily 7-day runs are far below it.
- Federal Register republications (`R1-2026-03829`) are stored alongside
  the original (`2026-03829`): duplicate-coverage grouping, roadmap item 8.
- Inside edge functions, `SUPABASE_SERVICE_ROLE_KEY` is now the `sb_secret_…`
  key, not the legacy JWT. Service-role calls to functions that compare the
  bearer token (`resolveFirmContext`) need the new key; the cron jobs only
  call sync functions, which don't compare it.
