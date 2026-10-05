# Investigate: detailed impact breakdown, cards toggle, dismiss

Asks: (1) detailed, professional, NEUTRAL breakdown of how a regulation affects the firm/funds/companies
in the detail view; (2) interactive cards explaining impact per entity, switched with the summary via a
toggle; (3) explain how old regulations are stored; (4) let users delete unneeded regulations.

Findings
- regulations: shared table, permanent, upsert by (source, external_id). Sync fetches 7 days daily.
  raw jsonb holds the Federal Register document JSON incl. raw_text_url (full plain text).
- regulation_relevance: per-firm links; NOT_RELEVANT markers stop re-evaluation. Dashboard lists all relevant,
  newest first, no limit. Members have SELECT + DELETE policies only; no UPDATE.
- Detail view shows only headline.summary (the Federal Register abstract) - short.
- Deleting a link isn't durable: match-relevance / company-regulations would recreate it. Shared regulations
  rows can't be deleted by one firm. => soft dismiss via dismissed_at on the firm's links, restorable.
- Decisions (user): impact generated in the BACKGROUND for relevant items; dismiss WITH undo.
- Project rule: no AI-assigned severity; neutral tone.

Design
- regulation_impacts(regulation_id, firm_id, content jsonb) written by service role, read by members.
- _shared/impact.ts generateImpact(): loads regulation text (FR raw_text_url, else fetched source page, truncated),
  firm/fund/company profiles, linked entities; forced-tool structured output; neutral prompt.
- regulation-impact function: on-demand fallback (rate limited); match-relevance / company-regulations call the
  same generator via EdgeRuntime.waitUntil for newly relevant items (capped, concurrency 3).
