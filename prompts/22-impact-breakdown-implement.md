# Implement
1. Migration 0011: dismissed_at + UPDATE policy on regulation_relevance; regulation_impacts table + RLS.
2. _shared/impact.ts + regulation-impact function; hook into match-relevance and company-regulations.
3. data.ts: fetchImpact, requestImpact, dismiss/restore/fetchDismissed; filter dismissed everywhere; keep
   dismissed rows when a company's cached scan is cleared.
4. HeadlineDetailView: Summary | Impact Cards toggle, detailed sections, interactive cards, Dismiss button.
5. Dashboard: hover dismiss; Profile: Dismissed tab with Restore.
Verify: tsc, apply migration, generate a real breakdown, check neutrality, dismiss/restore round trip.
