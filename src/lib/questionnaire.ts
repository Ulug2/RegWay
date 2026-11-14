// Single source of truth for the onboarding questionnaire. Every question is
// declared once here; the signup flow, the "complete later" forms and the
// completion reminders are all driven from this registry.
//
// `stage: 'onboarding'` questions are asked at signup — only what changes what
// the first dashboard shows, or what's needed to create the record.
// `stage: 'later'` questions are answered afterwards from Profile, and the
// required ones drive the completion nudges.

export type Scope = 'firm' | 'fund' | 'company'
export type Stage = 'onboarding' | 'later'
export type QType = 'text' | 'url' | 'number' | 'year' | 'select' | 'multi' | 'yesno' | 'location' | 'tags'

export interface LocationValue {
  country: string
  state: string
  city: string
}

export type Answers = Record<string, unknown>

export interface Question {
  id: string
  scope: Scope
  stage: Stage
  section: string
  label: string
  type: QType
  required: boolean
  help?: string
  placeholder?: string
  options?: string[]
  // Pre-selected recommendation. Counts as answered for completion purposes.
  defaultValue?: unknown
  showIf?: (a: Answers) => boolean
}

// ---------------------------------------------------------------------------
// Option lists
// ---------------------------------------------------------------------------

export const INDUSTRIES = [
  'Healthcare', 'Financial Services', 'FinTech', 'Software / SaaS', 'Technology', 'Consumer',
  'Business Services', 'Industrials', 'Manufacturing', 'Energy', 'Infrastructure',
  'Transportation / Logistics', 'Insurance', 'Real Estate', 'Defense / Aerospace',
  'Government Services', 'Education', 'Media / Telecom', 'Food & Agriculture', 'Other',
]

export const GEOGRAPHIES = [
  'United States', 'Canada', 'Europe', 'United Kingdom', 'Latin America', 'Asia-Pacific',
  'Middle East', 'Africa', 'Global',
]

export const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
  'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
  'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico',
  'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania',
  'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming', 'District of Columbia',
]

const STATE_ABBR: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas',
  UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
}

// Every country, not a short list of common fund domiciles: supplier and
// operating locations drive geopolitical/sanctions matching, which is most
// useful precisely for countries outside the usual PE set. Names match the
// canonical names in supabase/functions/_shared/countries.ts, which the
// matcher resolves these values with. "Georgia (country)" because the
// operating-location picker also lists U.S. states.
export const COUNTRIES = [
  'United States', 'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda',
  'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh',
  'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bermuda', 'Bhutan', 'Bolivia',
  'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'British Virgin Islands', 'Brunei', 'Bulgaria',
  'Burkina Faso', 'Burma', 'Burundi', 'Cabo Verde', 'Cambodia', 'Cameroon', 'Canada',
  'Cayman Islands', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros',
  'Costa Rica', "Cote d'Ivoire", 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic',
  'Democratic Republic of the Congo', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic',
  'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini',
  'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon', 'Gambia', 'Georgia (country)', 'Germany',
  'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti',
  'Honduras', 'Hong Kong', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland',
  'Israel', 'Italy', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati', 'Kosovo',
  'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya',
  'Liechtenstein', 'Lithuania', 'Luxembourg', 'Macau', 'Madagascar', 'Malawi', 'Malaysia',
  'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico',
  'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Namibia',
  'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea',
  'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Palau', 'Panama', 'Papua New Guinea',
  'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Republic of the Congo',
  'Romania', 'Russia', 'Rwanda', 'Saint Kitts and Nevis', 'Saint Lucia',
  'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'Sao Tome and Principe',
  'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia',
  'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain',
  'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan',
  'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia',
  'Turkey', 'Turkmenistan', 'Tuvalu', 'Uganda', 'Ukraine', 'United Arab Emirates',
  'United Kingdom', 'Uruguay', 'Uzbekistan', 'Vanuatu', 'Venezuela', 'Vietnam',
  'West Bank and Gaza', 'Yemen', 'Zambia', 'Zimbabwe',
]

const FIRM_TYPES = [
  'Private Equity', 'Venture Capital', 'Growth Equity', 'Private Equity & Venture Capital',
  'Multi-strategy investment firm', 'Family Office', 'Other',
]
const FIRM_STRATEGIES = [
  'Buyout', 'Lower Middle Market', 'Middle Market', 'Growth Equity', 'Venture Capital',
  'Roll-up / Buy-and-Build', 'Sector-focused investing', 'Minority Growth Investments',
  'Special Situations', 'Other',
]
const FIRM_AUM = ['Under $100M', '$100M-$250M', '$250M-$500M', '$500M-$1B', '$1B-$5B', '$5B-$25B', '$25B+', 'Prefer not to say']
const ADVISER_REGISTRATION = [
  'SEC Registered Investment Adviser', 'Exempt Reporting Adviser', 'State Registered Adviser',
  'Registered with a non-U.S. regulator', 'Not registered', 'Not sure', 'Other',
]
const TEAMS = [
  'General Counsel / Legal', 'Chief Compliance Officer / Compliance', 'Investment Team',
  'Portfolio Operations', 'Finance / CFO', 'Operating Partners', 'Managing Partners',
  'Analysts / Associates', 'Other',
]
const GOALS = [
  'Monitor regulatory changes', 'Understand which regulations affect our investments',
  'Monitor portfolio-company financial performance', 'Regulatory and legal research',
  'Portfolio research', 'Due diligence', 'Financial modeling', 'Regulatory impact modeling', 'Other',
]

export const LEGAL_STRUCTURES = ['Delaware LP', 'Delaware LLC', 'Luxembourg SCSp', 'Luxembourg SCA', 'Cayman LP', 'UK LLP', 'Irish ICAV', 'Other']
const FUND_STATUS = ['Fundraising', 'Currently investing', 'Fully invested', 'Harvesting / Exiting investments', 'Closed', 'Other']
const FUND_STRATEGIES = ['Buyout', 'Growth Equity', 'Venture Capital', 'Minority Investments', 'Roll-up / Buy-and-Build', 'Special Situations', 'Sector-focused', 'Other']
const FUND_SIZE = ['Under $50M', '$50M-$100M', '$100M-$250M', '$250M-$500M', '$500M-$1B', '$1B-$5B', '$5B+', 'Prefer not to say']
const OWNERSHIP_FUND = ['Majority / Control', 'Significant Minority', 'Minority', 'Mix of control and minority investments']
const OWNERSHIP_COMPANY = ['Majority / Control', 'Significant Minority', 'Minority', 'Other']
const COMPANY_SIZES = ['Early-stage startups', 'Growth-stage companies', 'Lower middle market', 'Middle market', 'Upper middle market', 'Large companies']
export const RECOMMENDED = "Use RegWay's recommended settings"
const PRIORITY_AREAS = [
  RECOMMENDED, 'Investment adviser regulation', 'Fund regulation', 'Securities regulation', 'M&A / Antitrust',
  'Employment / Labor', 'Privacy / Data Protection', 'Cybersecurity', 'Artificial Intelligence',
  'Healthcare', 'Licensing', 'Environmental', 'Consumer Protection', 'Financial Services', 'Sanctions',
  'Export Controls', 'Government Contracting', 'Tax', 'Trade / Tariffs', 'Industry-specific regulations',
]
const PROPOSED_REGS = [
  'Show proposed and final regulations',
  'Only show proposed regulations when they could materially affect an investment',
  'Only show final / enacted regulations',
]
const PROPOSED_DEFAULT = PROPOSED_REGS[1]
const NOTIFICATIONS = ['RegWay dashboard', 'Daily Morning Brief email', 'Immediate alerts for high-priority changes', 'Weekly summary']
const CUSTOMERS = ['Consumers', 'Small businesses', 'Large businesses', 'Financial institutions', 'Healthcare organizations', 'Government', 'Schools / universities', 'Other']
const EMPLOYEES = ['Under 25', '25-99', '100-249', '250-499', '500-999', '1,000-4,999', '5,000+', 'Not sure']
const REVENUE = ['Under $10M', '$10M-$25M', '$25M-$50M', '$50M-$100M', '$100M-$250M', '$250M-$500M', '$500M-$1B', '$1B+', 'Prefer not to say']
const YES_NO_UNSURE = ['Yes', 'No', 'Not sure']
const LICENSES = [
  'Healthcare license', 'Financial services license', 'Insurance license', 'Professional license',
  'Environmental permit', 'Transportation license', 'Government authorization', 'Other',
]
const SENSITIVE = ["Personal consumer data", 'Health / patient information', 'Financial information', "Children's data", 'Biometric data', 'Government information', 'None', 'Not sure']
const GOV_LEVEL = ['Federal', 'State / local', 'Both']
const LEGAL_TEAM = ['Yes - internal legal / compliance team', 'Primarily uses outside counsel', 'Both', 'Not sure']

const OPERATING_SHORTCUTS = ['All United States', 'Nationwide', 'International']
const OPERATING_OPTIONS = [...OPERATING_SHORTCUTS, ...US_STATES, ...COUNTRIES.filter(c => c !== 'United States')]

const includesUS = (v: unknown) => Array.isArray(v) && v.includes('United States')

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const QUESTIONS: Question[] = [
  // ---- Firm: signup ----
  { id: 'name', scope: 'firm', stage: 'onboarding', section: 'Your firm', label: 'Firm name', type: 'text', required: true, placeholder: 'e.g. Meridian Capital Partners' },
  { id: 'hq', scope: 'firm', stage: 'onboarding', section: 'Your firm', label: 'Where is your firm headquartered?', type: 'location', required: true },
  { id: 'firm_type', scope: 'firm', stage: 'onboarding', section: 'Your firm', label: 'Which best describes your firm?', type: 'select', required: true, options: FIRM_TYPES },
  { id: 'industries', scope: 'firm', stage: 'onboarding', section: 'Investment focus', label: 'Which industries does your firm primarily invest in?', type: 'multi', required: true, options: INDUSTRIES },
  { id: 'geographies', scope: 'firm', stage: 'onboarding', section: 'Investment focus', label: 'Which geographies does your firm primarily invest in?', type: 'multi', required: true, options: GEOGRAPHIES },
  { id: 'adviser_registration', scope: 'firm', stage: 'onboarding', section: 'Regulatory status', label: 'How is your investment adviser currently registered?', type: 'select', required: false, options: ADVISER_REGISTRATION, help: 'This decides which SEC rules apply to you. "Not sure" is fine.' },

  // ---- Firm: later ----
  { id: 'website', scope: 'firm', stage: 'later', section: 'Your firm', label: "Firm website", type: 'url', required: true, placeholder: 'https://' },
  { id: 'legal_name', scope: 'firm', stage: 'later', section: 'Your firm', label: 'Legal name of your management company', type: 'text', required: false, help: 'If you are unsure, you can skip this for now.' },
  { id: 'gp_entity', scope: 'firm', stage: 'later', section: 'Your firm', label: 'Name of the General Partner entity', type: 'text', required: false },
  { id: 'legal_domicile', scope: 'firm', stage: 'later', section: 'Your firm', label: 'Where is your management company or GP entity legally domiciled?', type: 'location', required: false, help: 'Its state or country of formation/incorporation, if different from your headquarters above (e.g. a Delaware LLC headquartered in New York).' },
  { id: 'offices', scope: 'firm', stage: 'later', section: 'Your firm', label: 'Other office locations', type: 'tags', required: false, placeholder: 'e.g. London, UK' },
  { id: 'strategies', scope: 'firm', stage: 'later', section: 'Investment focus', label: 'What investment strategies does your firm primarily use?', type: 'multi', required: true, options: FIRM_STRATEGIES },
  { id: 'key_states', scope: 'firm', stage: 'later', section: 'Investment focus', label: 'Which U.S. states are particularly important to your firm?', type: 'multi', required: false, options: US_STATES, showIf: a => includesUS(a.geographies) },
  { id: 'aum', scope: 'firm', stage: 'later', section: 'Firm size', label: 'Approximately how much does your firm manage?', type: 'select', required: false, options: FIRM_AUM },
  { id: 'teams', scope: 'firm', stage: 'later', section: 'Using RegWay', label: 'Which teams will primarily use RegWay?', type: 'multi', required: true, options: TEAMS },
  { id: 'goals', scope: 'firm', stage: 'later', section: 'Using RegWay', label: 'What would you like RegWay to help your firm with?', type: 'multi', required: true, options: GOALS },

  // ---- Fund: signup ----
  { id: 'name', scope: 'fund', stage: 'onboarding', section: 'Fund basics', label: 'Fund name', type: 'text', required: true, placeholder: 'e.g. Meridian Fund VI' },
  { id: 'domicile', scope: 'fund', stage: 'onboarding', section: 'Fund basics', label: 'Where is the fund domiciled?', type: 'location', required: true },
  { id: 'structure', scope: 'fund', stage: 'onboarding', section: 'Fund basics', label: 'Legal structure', type: 'select', required: true, options: LEGAL_STRUCTURES },

  // ---- Fund: later ----
  { id: 'vintage', scope: 'fund', stage: 'later', section: 'Fund basics', label: "Vintage year", type: 'year', required: true, placeholder: 'e.g. 2022' },
  { id: 'status', scope: 'fund', stage: 'later', section: 'Fund basics', label: 'Current status', type: 'select', required: true, options: FUND_STATUS },
  { id: 'size', scope: 'fund', stage: 'later', section: 'Fund basics', label: 'Approximate fund size', type: 'select', required: false, options: FUND_SIZE },
  { id: 'strategy', scope: 'fund', stage: 'later', section: 'Investment focus', label: "Primary investment strategy", type: 'multi', required: true, options: FUND_STRATEGIES },
  { id: 'ownership', scope: 'fund', stage: 'later', section: 'Investment focus', label: 'Type of ownership this fund usually takes', type: 'select', required: true, options: OWNERSHIP_FUND },
  { id: 'company_size', scope: 'fund', stage: 'later', section: 'Investment focus', label: 'What size companies does this fund typically invest in?', type: 'multi', required: false, options: COMPANY_SIZES },
  { id: 'industries', scope: 'fund', stage: 'later', section: 'Investment focus', label: 'Industries this fund invests in', type: 'multi', required: false, options: INDUSTRIES, help: "Leave blank to use your firm's industries." },
  { id: 'geographies', scope: 'fund', stage: 'later', section: 'Investment focus', label: 'Countries or regions this fund can invest in', type: 'multi', required: false, options: GEOGRAPHIES, help: "Leave blank to use your firm's geographies." },
  { id: 'key_states', scope: 'fund', stage: 'later', section: 'Investment focus', label: 'Which U.S. states are most relevant to this fund?', type: 'multi', required: false, options: US_STATES, showIf: a => includesUS(a.geographies) },
  { id: 'priority_areas', scope: 'fund', stage: 'later', section: 'Monitoring preferences', label: 'Regulatory areas to prioritize', type: 'multi', required: false, options: PRIORITY_AREAS, defaultValue: [RECOMMENDED] },
  { id: 'proposed_regs', scope: 'fund', stage: 'later', section: 'Monitoring preferences', label: 'Should RegWay monitor proposed regulations as well as final ones?', type: 'select', required: false, options: PROPOSED_REGS, defaultValue: PROPOSED_DEFAULT },
  { id: 'notifications', scope: 'fund', stage: 'later', section: 'Monitoring preferences', label: 'How would you like to receive important updates?', type: 'multi', required: false, options: NOTIFICATIONS, defaultValue: ['RegWay dashboard'], help: 'Email briefs and alerts are coming soon — your choice is saved for when they launch.' },
  { id: 'financial_monitoring', scope: 'fund', stage: 'later', section: 'Optional extras', label: 'Monitor portfolio-company financial performance?', type: 'yesno', required: false, help: 'You can enable this later. Financials are not required for regulatory monitoring.' },
  { id: 'ai_diligence', scope: 'fund', stage: 'later', section: 'Optional extras', label: 'Use RegWay AI for diligence and investment analysis?', type: 'yesno', required: false },

  // ---- Company: signup ----
  { id: 'name', scope: 'company', stage: 'onboarding', section: 'Company basics', label: 'Company name', type: 'text', required: true, placeholder: 'e.g. NovaPay' },
  { id: 'website', scope: 'company', stage: 'onboarding', section: 'Company basics', label: 'Website', type: 'url', required: true, placeholder: 'https://', help: 'Helps RegWay tell the right company apart when researching.' },
  { id: 'hq', scope: 'company', stage: 'onboarding', section: 'Company basics', label: 'Where is the company headquartered?', type: 'location', required: true },
  { id: 'industry', scope: 'company', stage: 'onboarding', section: 'Company basics', label: 'Industry', type: 'select', required: true, options: INDUSTRIES },
  { id: 'description', scope: 'company', stage: 'onboarding', section: 'Company basics', label: 'In one sentence, what does the company do?', type: 'text', required: true, placeholder: 'e.g. B2B payments infrastructure for mid-market retailers' },

  // ---- Company: later ----
  { id: 'operating_locations', scope: 'company', stage: 'later', section: 'Where it operates', label: 'Where does the company currently operate?', type: 'multi', required: true, options: OPERATING_OPTIONS, help: 'Countries and U.S. states with meaningful operations, employees, facilities or customers.' },
  { id: 'outside_us', scope: 'company', stage: 'later', section: 'Where it operates', label: 'Does the company operate outside the United States?', type: 'yesno', required: true },
  { id: 'foreign_countries', scope: 'company', stage: 'later', section: 'Where it operates', label: 'Which countries?', type: 'multi', required: false, options: COUNTRIES.filter(c => c !== 'United States'), showIf: a => a.outside_us === 'yes' },
  { id: 'facilities', scope: 'company', stage: 'later', section: 'Where it operates', label: 'Does the company operate physical facilities or locations?', type: 'yesno', required: true, help: 'Hospitals, plants, stores, warehouses, clinics, offices, data centers…' },
  { id: 'facility_locations', scope: 'company', stage: 'later', section: 'Where it operates', label: 'Where are the main facilities located?', type: 'tags', required: false, placeholder: 'e.g. Austin, TX', showIf: a => a.facilities === 'yes' },
  { id: 'supplier_locations', scope: 'company', stage: 'later', section: 'Where it operates', label: 'Where are its key suppliers, manufacturers, or vendors based?', type: 'multi', required: false, options: OPERATING_OPTIONS, help: 'Distinct from where the company itself operates. Used for supply-chain and trade-exposure monitoring (sanctions, tariffs, export controls).' },
  { id: 'secondary_industries', scope: 'company', stage: 'later', section: 'Business', label: 'Secondary industries', type: 'multi', required: false, options: INDUSTRIES },
  { id: 'products', scope: 'company', stage: 'later', section: 'Business', label: 'Main products or services', type: 'tags', required: true, placeholder: 'Type and press Enter' },
  { id: 'customers', scope: 'company', stage: 'later', section: 'Business', label: 'Primary customers', type: 'multi', required: true, options: CUSTOMERS },
  { id: 'consumer_facing', scope: 'company', stage: 'later', section: 'Business', label: 'Does the company sell directly to consumers?', type: 'yesno', required: true },
  { id: 'employees', scope: 'company', stage: 'later', section: 'Business', label: 'Approximate number of employees', type: 'select', required: false, options: EMPLOYEES },
  { id: 'revenue', scope: 'company', stage: 'later', section: 'Business', label: 'Approximate annual revenue', type: 'select', required: false, options: REVENUE },
  { id: 'ownership', scope: 'company', stage: 'later', section: 'Your investment', label: 'What ownership position does your fund have?', type: 'select', required: true, options: OWNERSHIP_COMPANY },
  { id: 'legal_team', scope: 'company', stage: 'later', section: 'Your investment', label: 'Does the company have its own legal or compliance team?', type: 'select', required: false, options: LEGAL_TEAM },
  { id: 'regulated', scope: 'company', stage: 'later', section: 'Regulatory profile', label: 'Does the company operate in a regulated or licensed industry?', type: 'select', required: false, options: YES_NO_UNSURE },
  { id: 'license_types', scope: 'company', stage: 'later', section: 'Regulatory profile', label: 'What licenses or approvals does it generally require?', type: 'multi', required: false, options: LICENSES, showIf: a => a.regulated === 'Yes' },
  { id: 'sensitive_data', scope: 'company', stage: 'later', section: 'Regulatory profile', label: 'Does the company handle sensitive information?', type: 'multi', required: false, options: SENSITIVE },
  { id: 'gov_contracts', scope: 'company', stage: 'later', section: 'Regulatory profile', label: 'Does it sell to or contract with government agencies?', type: 'select', required: false, options: YES_NO_UNSURE },
  { id: 'gov_level', scope: 'company', stage: 'later', section: 'Regulatory profile', label: 'Which level of government?', type: 'select', required: false, options: GOV_LEVEL, showIf: a => a.gov_contracts === 'Yes' },
  { id: 'trade', scope: 'company', stage: 'later', section: 'Regulatory profile', label: 'Does the company import or export goods or services?', type: 'select', required: false, options: YES_NO_UNSURE },
  { id: 'trade_regions', scope: 'company', stage: 'later', section: 'Regulatory profile', label: 'Which major countries or regions?', type: 'tags', required: false, placeholder: 'e.g. Mexico, China', showIf: a => a.trade === 'Yes' },
]

export function questionsFor(scope: Scope, stage?: Stage): Question[] {
  return QUESTIONS.filter(q => q.scope === scope && (!stage || q.stage === stage))
}

// ---------------------------------------------------------------------------
// Answers <-> database rows
// ---------------------------------------------------------------------------

// Legacy column-backed answers; everything else lives in `profile`.
const COLUMN_ANSWERS: Record<Scope, Record<string, string>> = {
  firm: { name: 'name', website: 'website' },
  fund: { name: 'name', size: 'size', structure: 'structure' },
  company: { name: 'name', website: 'website' },
}

const LOCATION_KEY: Record<Scope, string | null> = { firm: 'hq', fund: 'domicile', company: 'hq' }

export const emptyLocation = (): LocationValue => ({ country: 'United States', state: '', city: '' })

export function formatLocation(l: LocationValue | undefined): string {
  if (!l) return ''
  return [l.city, l.state, l.country].map(x => x?.trim()).filter(Boolean).join(', ')
}

// "New York, NY" or "New York, New York" -> {city: New York, state: New York, country: United States}
export function parseLegacyLocation(text: string | null | undefined): LocationValue | undefined {
  if (!text) return undefined
  const parts = text.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length !== 2 && parts.length !== 3) return undefined
  if (parts.length === 3 && !['US', 'USA', 'UNITED STATES'].includes(parts[2].toUpperCase())) return undefined

  // In a city/state pair, "Georgia" means the U.S. state, not the country.
  const state = STATE_ABBR[parts[1].toUpperCase()]
    ?? US_STATES.find(name => name.toLowerCase() === parts[1].toLowerCase())
  if (state) {
    return { country: 'United States', state, city: parts[0] }
  }
  if (parts.length === 3) return undefined
  return { country: parts[1], state: '', city: parts[0] }
}

const matchOption = (options: string[] | undefined, value: string | undefined) =>
  options?.find(o => o.toLowerCase() === value?.toLowerCase())

interface Row {
  [key: string]: unknown
  profile?: Record<string, unknown> | null
}

export function fromRow(scope: Scope, row: Row | null | undefined): Answers {
  const answers: Answers = {}
  if (!row) return answers
  const profile = (row.profile ?? {}) as Record<string, unknown>
  Object.assign(answers, profile)
  for (const [answerId, column] of Object.entries(COLUMN_ANSWERS[scope])) {
    if (row[column] != null && row[column] !== '') answers[answerId] = row[column]
  }
  const locKey = LOCATION_KEY[scope]
  if (locKey && !answers[locKey]) {
    const legacy = parseLegacyLocation((scope === 'firm' || scope === 'company' ? row.hq_location : null) as string | null)
    if (legacy) answers[locKey] = legacy
  }
  // Rows created before the questionnaire only have the legacy columns.
  if (scope === 'company') {
    const sectors = (row.sectors as string[] | undefined) ?? []
    if (!answers.industry && sectors[0]) {
      const m = matchOption(INDUSTRIES, sectors[0])
      if (m) answers.industry = m
    }
    if (!answers.description && row.offerings) answers.description = row.offerings
    const regions = (row.regions as string[] | undefined) ?? []
    if (!answers.operating_locations && regions.length) {
      const known = regions.map(r => matchOption(OPERATING_OPTIONS, r)).filter((r): r is string => !!r)
      if (known.length) answers.operating_locations = known
    }
  }
  if (scope === 'fund' && answers.size && !FUND_SIZE.includes(answers.size as string)) delete answers.size
  return answers
}

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))]

// ---------------------------------------------------------------------------
// Fact provenance (roadmap item 16): where each answer came from and when it
// was last confirmed, stored beside the answers in `profile_meta`.
// ---------------------------------------------------------------------------

export interface FactMeta {
  // Typed into RegWay, taken from a supporting document the user names, or
  // found on the web by RegWay's research and confirmed by the user.
  source: 'user' | 'document' | 'web'
  // The document's name or link, when there is one.
  document?: string
  // The page a web finding came from.
  url?: string
  // When the answer was last entered, changed, or confirmed as still correct.
  confirmed_at: string
}

export type ProfileMeta = Record<string, FactMeta>

// A fact not confirmed for this long is shown as due for a look.
export const STALE_AFTER_DAYS = 365

// Preferences and feature switches are settings, not facts about the entity.
const SETTINGS_SECTIONS = new Set(['Monitoring preferences', 'Optional extras', 'Using RegWay'])
export const isFact = (q: Question) => !SETTINGS_SECTIONS.has(q.section)

export const isStale = (meta: FactMeta | undefined, now = Date.now()) =>
  !!meta && now - Date.parse(meta.confirmed_at) > STALE_AFTER_DAYS * 86_400_000

export const metaOf = (row: object | null | undefined): ProfileMeta => (((row as Row | null | undefined)?.profile_meta ?? {}) as ProfileMeta)

const stamp = (document: string | undefined, at: string): FactMeta => (document ? { source: 'document', document, confirmed_at: at } : { source: 'user', confirmed_at: at })

export const sameAnswer = (a: unknown, b: unknown) => JSON.stringify(isEmpty(a) ? null : a) === JSON.stringify(isEmpty(b) ? null : b)

// What `profile_meta` should hold after a save. An answer that was entered
// or changed is stamped now: as typed by the user, or from the document the
// form names for it (the form drops a document when its answer is edited,
// since what backed the old value says nothing about the new one). An
// unchanged answer keeps its entry as the form left it (confirmed, or given
// a document). An unchanged answer from before provenance was kept stays
// without one: when it was entered isn't known, and saving something else
// doesn't confirm it. A cleared answer loses its entry.
function metaAfterSave(scope: Scope, answers: Answers, opts: SaveContext): ProfileMeta {
  const at = opts.now ?? new Date().toISOString()
  const before = opts.previous ? fromRow(scope, opts.previous as Row) : null
  const edited = opts.meta ?? metaOf(opts.previous)
  const meta: ProfileMeta = {}
  for (const q of questionsFor(scope)) {
    if (!isFact(q) || isEmpty(answers[q.id])) continue
    const document = edited[q.id]?.document?.trim() || undefined
    // A web finding the user confirmed keeps its page (lib/research.ts).
    const web = edited[q.id]?.source === 'web' && edited[q.id].url ? edited[q.id] : undefined
    if (!before || !sameAnswer(before[q.id], answers[q.id])) meta[q.id] = web && opts.meta ? { source: 'web', url: web.url, confirmed_at: at } : stamp(opts.meta ? document : undefined, at)
    else if (web) meta[q.id] = { source: 'web', url: web.url, confirmed_at: web.confirmed_at }
    else if (edited[q.id]) meta[q.id] = stamp(document, edited[q.id].confirmed_at)
  }
  return meta
}

export interface SaveContext {
  // The row as stored before this save; omitted when creating the entity.
  previous?: object | null
  // The form's provenance edits (confirmations, documents); defaults to
  // what is stored.
  meta?: ProfileMeta
  now?: string
}

export function toRow(scope: Scope, answers: Answers, context: SaveContext = {}): Record<string, unknown> {
  const row: Record<string, unknown> = { profile_meta: metaAfterSave(scope, answers, context) }
  const profile: Record<string, unknown> = {}
  const columnIds = COLUMN_ANSWERS[scope]

  for (const q of questionsFor(scope)) {
    const value = answers[q.id]
    if (columnIds[q.id]) {
      row[columnIds[q.id]] = typeof value === 'string' && value.trim() ? value.trim() : null
    } else if (!isEmpty(value)) {
      profile[q.id] = value
    }
  }
  row.profile = profile

  // Derived legacy columns the AI functions already read.
  if (scope === 'firm') {
    const hq = answers.hq as LocationValue | undefined
    const legalDomicile = answers.legal_domicile as LocationValue | undefined
    row.hq_location = formatLocation(hq) || null
    row.jurisdictions = uniq([
      hq?.state ?? '',
      legalDomicile?.state || legalDomicile?.country || '',
      ...((answers.geographies as string[] | undefined) ?? []),
      ...((answers.key_states as string[] | undefined) ?? []),
    ])
  }
  if (scope === 'fund') {
    const dom = answers.domicile as LocationValue | undefined
    row.jurisdictions = uniq([
      dom?.state || dom?.country || '',
      ...((answers.geographies as string[] | undefined) ?? []),
      ...((answers.key_states as string[] | undefined) ?? []),
    ])
  }
  if (scope === 'company') {
    const hq = answers.hq as LocationValue | undefined
    row.hq_location = formatLocation(hq) || null
    row.sectors = uniq([(answers.industry as string) ?? '', ...((answers.secondary_industries as string[] | undefined) ?? [])])
    row.regions = uniq([
      ...((answers.operating_locations as string[] | undefined) ?? []),
      ...((answers.foreign_countries as string[] | undefined) ?? []),
    ])
    const products = ((answers.products as string[] | undefined) ?? []).join(', ')
    row.offerings = [answers.description, products].filter(Boolean).join(' — ') || null
  }
  // Single funnel for every insert/update of this entity (onboarding,
  // "complete later" forms, Profile edits) — stamping it here means every
  // save path gets it for free, with no per-call-site changes needed.
  row.profile_updated_at = new Date().toISOString()
  return row
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

export function isEmpty(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') {
    const loc = value as Partial<LocationValue>
    const abroad = !!loc.country && loc.country !== 'United States'
    return !loc.city?.trim() && !loc.state?.trim() && !abroad
  }
  return false
}

const answerOf = (q: Question, answers: Answers) => (isEmpty(answers[q.id]) ? q.defaultValue : answers[q.id])

export const isVisible = (q: Question, answers: Answers) => !q.showIf || q.showIf(answers)

export function missingRequired(scope: Scope, answers: Answers, stage?: Stage): Question[] {
  return questionsFor(scope, stage).filter(
    q => q.required && isVisible(q, answers) && isEmpty(answerOf(q, answers)),
  )
}

export function requiredCount(scope: Scope, answers: Answers, stage?: Stage): number {
  return questionsFor(scope, stage).filter(q => q.required && isVisible(q, answers)).length
}

export interface CompletionItem {
  scope: Scope
  id: string | null
  label: string
  answered: number
  total: number
}

export function completionFor(scope: Scope, id: string | null, label: string, row: Row | null | undefined): CompletionItem {
  const answers = fromRow(scope, row)
  const total = requiredCount(scope, answers)
  return { scope, id, label, total, answered: total - missingRequired(scope, answers).length }
}
