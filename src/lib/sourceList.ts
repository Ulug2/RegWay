// Every name RegWay shows for where its documents come from, in one place.
// A new feed needs an entry in each list below that applies;
// tests/unit/sourceList.test.ts reads the sync functions and fails when a
// source they write has no name here.

// The public sources RegWay reads, as shown on the landing page and on the
// Sources page. Keep in step with what the sync functions actually poll
// (supabase/functions/sync-*).
export const SOURCES = [
  {
    region: 'United States',
    names: ['Federal Register', 'SEC announcements', 'SEC litigation releases', 'SEC administrative proceedings', 'FINRA disciplinary actions', 'FTC', 'CFPB', 'OFAC sanctions', 'BIS export controls', 'USTR trade actions', 'State Department travel advisories'],
  },
  { region: 'United Kingdom', names: ['UK FCA', 'UK PRA', 'UK legislation', 'UK sanctions (OFSI)'] },
  { region: 'European Union', names: ['EU ESMA', 'EUR-Lex', 'EU sanctions'] },
]

// Who published a document, as a short name, keyed by the `source` its row
// carries ("Also published as"). A company scan's finds (`ai_search`) are
// named by their site instead (duplicates.ts publisherName).
export const PUBLISHER_NAMES: Record<string, string> = {
  federal_register: 'Federal Register',
  sec_news: 'SEC announcement',
  ftc_news: 'FTC announcement',
  cfpb_news: 'CFPB announcement',
  sec_enforcement: 'SEC litigation release',
  sec_admin_proceedings: 'SEC administrative proceeding',
  finra_enforcement: 'FINRA',
  state_travel_advisories: 'State Department',
  fca_publications: 'FCA',
  pra_publications: 'Bank of England (PRA)',
  uk_legislation: 'legislation.gov.uk',
  uk_sanctions: 'legislation.gov.uk',
  ofsi: 'OFSI',
  esma_news: 'ESMA',
  eur_lex: 'EUR-Lex',
  eu_sanctions: 'EUR-Lex',
}

// A sync job's name, keyed by the `source` it records in `sync_runs` (the
// dashboard's "hasn't updated successfully" notice). One job can fetch
// several publishers: regulator_feeds is SEC, FTC, CFPB, FCA, PRA, UK
// legislation, OFSI, ESMA and EUR-Lex.
export const FEED_LABELS: Record<string, string> = {
  federal_register: 'Federal Register',
  sec_enforcement: 'SEC litigation releases',
  finra_enforcement: 'FINRA enforcement',
  sec_admin_proceedings: 'SEC administrative proceedings',
  state_travel_advisories: 'State Department travel advisories',
  // sync-regulator-feeds: SEC, FTC, CFPB, FCA, PRA, UK legislation, ESMA, EUR-Lex.
  regulator_feeds: 'Regulator feeds (U.S., UK and EU)',
  // run-matching: the scheduled AI matching of new developments to firms.
  matching: 'Automatic matching',
}
