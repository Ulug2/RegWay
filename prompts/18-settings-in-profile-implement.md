# Implement: Settings inside Profile

1. Migration 0007: DELETE policy on `regulation_relevance` for members
   (`firm_id = auth_firm_id()`).
2. Extract `TagInput` -> `src/components/TagInput.tsx`, option lists ->
   `src/lib/options.ts`; OnboardingModal imports them.
3. `data.ts`: add/update/remove helpers for funds and portfolio companies.
   `updatePortfolioCompany` clears that company's cached relevance rows when
   hq_location/sectors/regions changed.
4. Profile tabs: Account (existing) | Firm | Funds | Portfolio Companies.
   Two-step inline remove (no browser confirm dialogs).
5. Wiring: `ProfileTab` state in App; avatar -> Account tab, Settings pill
   -> Firm tab.
6. Verify: tsc; live add/edit/remove a fund and a company; edit a company's
   HQ location and confirm cached relevance rows are cleared (psql);
   confirm changes show on the dashboard.
