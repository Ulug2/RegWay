# Implement: onboarding split + complete-later form + reminders

1. Migration 0009: firms/portfolio_companies.website, profile jsonb on firms/funds/portfolio_companies.
2. src/lib/questionnaire.ts: single registry of questions (scope, stage, type, required, showIf),
   fromRow/toRow mapping to legacy columns (derives hq_location, jurisdictions, sectors, regions,
   offerings so AI functions keep working), completion helpers.
3. Generic QuestionField/QuestionForm; rewrite OnboardingModal to essentials only (no demo data).
4. Profile tabs Firm/Funds/Portfolio -> registry-driven cards with completion badges (replace settings/*).
5. Dashboard reminder card + avatar/settings dot; snooze 24h; deep link to first incomplete entity.
6. Feed profile fields into match-relevance / company-regulations prompts.
Verify: tsc, apply migration, real DB round trip, browser walk-through of onboarding + later form.
