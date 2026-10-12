# Federal Register public inspection — implement

Follows `docs/notes/public-inspection-investigate.md` (same prompt), including
its correction: a separate public-inspection feed was built, run against
the live list, found to add nothing, and removed.

## What happened

1. Built the planned feed (classify `public-inspection-documents/current.json`
   with the existing `FEEDS`). Live run: `listed: 108, stored: 0`. The same
   code run locally classified 3 documents correctly; on Supabase all 3 were
   skipped because the documents search had already returned them, with
   their future publication dates, earlier in the same run. Checked: the
   documents API lists 106 documents dated ≥ 10-05; every tracked rule on
   the public-inspection list was already stored (since 10-03).
2. So the gap was the label, not the lead time. Replaced the feed with a
   flag: `regulations.on_public_inspection` = scheduled publication date
   later than today (Eastern, the Federal Register's issue date). The 30-min
   re-sync clears it on the issue date.

## What was built

| Piece | Where |
|---|---|
| `on_public_inspection` column | `supabase/migrations/0027_public_inspection.sql` |
| Flag from the scheduled date; one `documentRow` builder; `notYetPublished` in the run summary | `supabase/functions/sync-federal-register/index.ts` |
| Analysis waits for publication when a scheduled document's text can't be read (`awaiting_publication`, no model call, nothing stored); `regulation-impact` returns null content | `supabase/functions/_shared/impact.ts`, `regulation-impact/index.ts` |
| "Pre-publication" badge, "Publishes <date>", "Scheduled publication" in the sidebar, an awaiting message in the analysis panel | `src/components/PrePublicationBadge.tsx` (new), `EntityFeed.tsx`, `HeadlineDetailView.tsx`, `ImpactPanel.tsx`, `src/lib/data.ts`, `src/lib/types.ts` |

## Verification

- Live sync: `notYetPublished: 4`, exactly the 4 rows dated 10-05.
- GovInfo already serves tomorrow's issue (490 KB of real text for the SEC
  interval-fund proposal), so a scheduled document is often analysed from
  its real text; the wait only applies when it's genuinely unreadable.
  Forced that case locally (all document URLs failing):
  `generateImpact` → `awaiting_publication`, no model call, no row.
- Browser (throwaway firm, deleted): the scheduled SEC proposal shows
  "Pre-publication" and "Publishes Oct 5, 2026" beside a published item.
- No AI spent (usage_events: 0 in the hour).
