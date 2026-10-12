# Implement: enforcement monitoring, part 1 (SEC litigation releases)

Scope for this pass: SEC Litigation Releases only. Explicitly NOT in this pass:
Administrative Proceedings (PDF text), FINRA (no reliable feed), geopolitical/sanctions,
the category filter UI (roadmap item 3 — needs >1 category to matter, which this
creates, but the filter control itself is separately scoped work).

Parts, each independently verifiable:

1. **Schema** — migration: `regulations.category` (default 'regulatory'), widen the
   `source` check constraint to add `sec_enforcement`. No behavior change to existing
   rows/functions.
2. **Ingestion** — `supabase/functions/sync-sec-enforcement/index.ts`: fetch the
   litigation-releases RSS, for each item fetch its HTML page and extract the
   narrative (reuse/extend the strip-HTML helper already in `_shared/impact.ts`
   rather than duplicating it — move it to `_shared/text.ts` if both need it),
   upsert into `regulations` with `source: 'sec_enforcement'`, `category:
   'enforcement'`, `external_id` = release number. One retry on a non-200 fetch.
   Schedule via pg_cron alongside the existing federal-register job.
3. **Shared matching plumbing** — extract `_shared/relevance.ts` from
   `match-relevance/index.ts` (auth/firmId resolution, entity fetch, rate limit,
   verdict-to-row mapping, upsert) with no behavior change to `match-relevance`
   itself (verify: existing tests/manual smoke still match).
4. **Enforcement matcher** — `supabase/functions/match-enforcement-relevance/index.ts`
   built on the shared helper from (3), its own prompt/verdict schema per the
   doc's rules (meaningful-overlap requirement, allegation/finding/settlement
   language preserved, explicit "does not mean wrongdoing" framing, states
   differences and missing facts). Hooks into `generateImpacts` the same way
   `match-relevance` does, with a category-aware addendum to the impact prompt
   in `_shared/impact.ts` rather than a forked copy.
5. **Minimal UI signal** — a category badge on `HeadlineItem` cards and in the
   detail view so enforcement items are visibly distinct from regulatory ones
   (full filter control stays roadmap item 3).

Verify at each part with real data: row counts and a spot-checked real release
after (2); confirm (3) doesn't change `match-relevance`'s output for a known
firm; a real match + impact for a real enforcement item after (4); a screenshot
after (5).
