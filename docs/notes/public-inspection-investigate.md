# Federal Register public inspection — investigate

Roadmap: `plans/regway-mvp-roadmap.md` → Priority order item 2 (live
monitoring), remaining Phase 1 ("1b"): public-inspection ingestion.

## Prompt

> Do the next thing

## The feed (live, 2026-10-04)

- `api/v1/public-inspection-documents/current.json`: the latest public
  inspection list, 108 documents (81 notices, 17 proposed rules, 9 rules,
  1 presidential document; 101 regular, 7 special filings).
- Lead time is often days, not one: documents filed Thursday 10-01 are
  scheduled for Monday 10-05.
- Each document carries the **same `document_number`** it will be published
  under, plus `type` (display name: "Rule", "Proposed Rule", "Notice",
  "Presidential Document"), `agencies` with slugs, scheduled
  `publication_date` (null for 1 of 108), `filed_at`, `html_url`, `pdf_url`,
  `raw_text_url`. No abstract.
- **No server-side filtering**: `public-inspection-documents.json` with
  `conditions[agencies][]`/`conditions[type][]` returns 0. The day's list
  has to be classified client-side against the sync's existing `FEEDS`.
- **Text**: `raw_text_url` is on federalregister.gov (302 to the unblock
  page from this container; reachable from Supabase at times). GovInfo has
  nothing until publication. So a pre-publication item often has no
  readable text.

## What exists

| Piece | State |
|---|---|
| `sync-federal-register` | Declarative `FEEDS` (query agencies + API type codes + optional `keep` filter), runs every 30 min. Upserts on `(source, external_id = document_number)`. |
| Identity | Same document number before and after publication, so a public-inspection row becomes the published row on upsert, and any match already made keeps pointing at it. |
| `_shared/impact.ts` | Falls back to the summary when no text is readable. For a pre-publication item (no abstract either) that's a blind analysis — the failure fixed earlier this session. |
| UI | Dates labelled "Published …"; nothing distinguishes a scheduled document. |
| Matching | `run-matching` picks up any new row; matchers see title (+ summary). |

## Plan

1. `regulations.on_public_inspection boolean` (migration). Published rows
   set it false explicitly, so publication clears it.
2. Sync: after the published feeds, classify the current public-inspection
   list with the **same** `FEEDS` (type display name → API code, agency slug
   match, `keep`), skip documents with no scheduled date, and never write a
   public-inspection row over a document already stored as published (the
   list can still show it on publication day). Countries from the title.
3. Impact: a public-inspection item is analysed only from its own text
   (`raw_text_url`); if that can't be read, return `awaiting_publication`
   without calling the model or storing anything. Opening it after
   publication generates the analysis on demand, as today.
4. UI: a "Pre-publication" badge and "Publishes <date>" on list items and
   the detail page; the analysis panel says it'll be written once published
   instead of showing an error.

## Correction found while implementing

The plan above assumed public inspection gives earlier notice than the
documents search. It doesn't: `documents.json` already returns documents
scheduled for a future issue (106 dated ≥ 10-05 vs 107 scheduled on the
public-inspection list), and the existing sync had stored all four tracked
rules/proposed rules on today's list on 10-03, two days early. What it got
wrong was the label: those rows said "Published Oct 5". See
`public-inspection-implement.md`.
