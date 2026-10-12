# Investigate: onboarding questionnaire (docs/product/Regway_AI_Onboarding_Questions_Plain_Text.pdf)

Goal: decide which of the ~56 questions belong in signup onboarding and which move to a
"complete later" form, then reminders to complete it.

Evidence gathered
- PDF has 3 questionnaires: Firm/GP (16 q), Fund (17 q), Portfolio Company (20 q) + enrichment
  + a "do not request" list (no LP data, cap tables, financials, credentials).
- Today's onboarding asks: firm name/HQ/jurisdictions/GP name, companies (name/AUM/sectors/
  offerings), funds (name/size/structure/jurisdictions). Prefilled with demo data (Meridian).
- The AI functions only consume: firm.hq_location + jurisdictions; fund.structure + jurisdictions;
  company.hq_location + sectors + regions + offerings. So relevance quality is driven by
  WHERE (HQ / operating locations), WHAT (industry / activity) and adviser status.
- Schema has no place for most PDF answers.

Decision rule: ask at signup only what (a) changes the first dashboard's relevance or (b) is
needed to create the record. Everything else -> later form with a nudge.

Signup (essentials)
- Your name (greeting), Firm: name, HQ (country/state/city), firm type, industries, geographies,
  adviser registration (single strongest driver of which SEC rules apply; has "Not sure").
- First fund: name, domicile, legal structure.
- Companies: name, website (disambiguates the web-search scan), HQ, industry, one-line description.

Later (form + reminders)
- Firm: website, strategies, AUM, legal/GP entity names, other offices, teams, goals, key US states.
- Fund: vintage, status, strategy, size, industries/geographies (blank = inherit firm), ownership,
  company size, priority areas, proposed-vs-final preference, notification prefs, opt-ins.
- Company: operating locations, products, customers, facilities, consumer-facing, non-US ops,
  ownership + optional (employees, revenue, licences, sensitive data, gov contracts, trade, legal team).

Dropped / deferred
- Firm Q12/Q13 (# funds, # companies): derived from actual records, don't ask.
- Fund Q15 (brief recipients): single-user tenancy today; revisit with teams. Morning Brief email
  doesn't exist yet, so notification prefs are stored only.
- Post-company enrichment + confirm screen: separate roadmap item.
- Fund-as-account model in PDF ("one fund = one account"): keep firm -> funds -> companies.
