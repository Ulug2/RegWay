# Investigate: Settings inside the Profile screen

Read-only. Settings (firm/workspace editing) lives inside the Profile
screen as tabs, not as a separate view.

Confirmed facts:
- RLS: `funds` and `portfolio_companies` have "for all" member policies, so
  insert/update/delete work from the client. `firms` UPDATE exists (0006).
  `regulation_relevance` has SELECT only — no client DELETE.
- `TagInput` and the JURISDICTIONS / SECTORS / LEGAL_STRUCTURES lists are
  inline in `OnboardingModal.tsx` — extract, don't duplicate.
- Onboarding never sets a portfolio company's `hq_location`, but
  `company-regulations` builds its search from `hq_location || regions ||
  "the United States"`. Foreign portfolio companies can't currently be
  expressed. Settings must expose HQ location per company.
- `company-regulations` results are cached as `regulation_relevance` rows
  (company-scoped). Editing a company's location/sectors/regions leaves
  stale cached results unless those rows are cleared (needs a DELETE
  policy).
- `match-relevance` skips already-evaluated regulations, so adding a fund
  or changing firm jurisdictions will NOT re-evaluate existing regulations.
  Known limitation to flag, not fix here.
- Dashboard "Settings" pill has no onClick; avatar goes to Profile.
