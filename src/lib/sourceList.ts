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
