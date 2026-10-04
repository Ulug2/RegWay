# Scheduled matching for H.I.G. + live AI tests — implement

Follows `hig-scheduled-matching-investigate.md`.

## Done

- Migration 0029 `scheduled_matching_firms`; H.I.G. enrolled;
  `run-matching` limited to it; `run-matching-30min` re-enabled.
- First forced run: 1 firm, 3 matcher calls, 80 evaluated, 8 relevant
  (6 GetixHealth Medicare payment rules/corrections, 2 private-fund-adviser
  enforcement cases), $0.15. Interval-fund and other scheduled 10-05
  documents judged not relevant.

## Bugs found by the live run

1. **Background analyses cut off.** Only 4 of 8 new matches got an
   analysis. A debug function showed the text fetch was fast (GovInfo
   ~100 ms) and a re-run returned `exists` for ones that had finished late:
   all analyses ran inside the matcher's invocation (3 at a time, 30–70 s
   each), and the platform stops background work at ~150 s wall clock.
   Fix: `generateImpacts` posts each analysis to `regulation-impact`, which
   now accepts the service key + `firmId`, returns 202 and generates in its
   own invocation. The 4 missing ones were queued this way and all written
   in ~60 s ($0.42). The user path of `regulation-impact` is unchanged
   (anon key still refused).
2. **Federal Register `.txt` is HTML.** The body is a `<pre>` page; it was
   treated as plain text because of the URL. `fetchPlainText` now strips
   whenever the body is HTML.

## AI tests on H.I.G.

- Geopolitical re-check (aircraft-import proclamation × A.L.A.): kept,
  reason rewritten, row replaced. $0.01.
- Regulatory re-check (IPF PPS correction × GetixHealth): kept, row
  replaced. $0.01.
- Not testable without the H.I.G. user signed in (signing in as them from a
  script was refused): company scan reason, copilot from a fund/company,
  copilot upload, pre-publication analysis (none matched today). Listed in
  the roadmap as a click-through.

Total spent this pass (`usage_events`): $0.94 — matchers $0.15, 10
analyses $0.77 (8 new matches + 2 re-written after the re-checks),
re-checks $0.017.
