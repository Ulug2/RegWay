// Which country a sanctions action is about, read from the legal authority it
// cites. OFAC's "Notice of OFAC Sanctions Action" names no country in its text:
// the designee list is published as an image ([GRAPHIC] [TIFF OMITTED]), and
// the body is boilerplate except for the authority line, e.g.
// "(Authority: E.O. 13902.)". The executive order says which program the
// designations fall under, and a country program says which country.
//
// The country is the program's, not the designees' addresses (a designee
// under the Iran program can be in the UAE). match-geopolitical-relevance's
// prompt treats a designation notice accordingly: the program country is not
// a measure on everyone who operates there.

// Executive orders that establish or expand a single-country sanctions
// program. Program-wide authorities deliberately map to nothing, so a notice
// citing only them stays country-less (global): E.O. 13224 (terrorism),
// 13382 (WMD proliferation), 13581 (transnational crime), 13694 (cyber),
// 13818 (Global Magnitsky), 13848 (election interference), 14059 (narcotics),
// 14078 (hostage-taking). Regional ones (13219/14033, Western Balkans) too.
const COUNTRY_PROGRAM_ORDERS: Record<string, string> = {
  // Iran
  '12957': 'Iran', '12959': 'Iran', '13059': 'Iran', '13553': 'Iran', '13574': 'Iran', '13590': 'Iran',
  '13599': 'Iran', '13622': 'Iran', '13628': 'Iran', '13645': 'Iran', '13846': 'Iran', '13871': 'Iran',
  '13876': 'Iran', '13902': 'Iran', '13949': 'Iran',
  // Syria
  '13338': 'Syria', '13399': 'Syria', '13460': 'Syria', '13572': 'Syria', '13573': 'Syria', '13582': 'Syria',
  '13894': 'Syria',
  // Russia, and the Ukraine-related program
  '13661': 'Russia', '13662': 'Russia', '14024': 'Russia', '14066': 'Russia', '14068': 'Russia',
  '14071': 'Russia', '14114': 'Russia',
  '13660': 'Ukraine', '13685': 'Ukraine', '14065': 'Ukraine',
  // North Korea
  '13466': 'North Korea', '13551': 'North Korea', '13570': 'North Korea', '13687': 'North Korea',
  '13722': 'North Korea', '13810': 'North Korea',
  // Venezuela
  '13692': 'Venezuela', '13808': 'Venezuela', '13827': 'Venezuela', '13835': 'Venezuela',
  '13850': 'Venezuela', '13884': 'Venezuela',
  // Single-country programs elsewhere
  '13405': 'Belarus', '14038': 'Belarus',
  '14014': 'Burma',
  '13067': 'Sudan', '13400': 'Sudan', '13412': 'Sudan', '14098': 'Sudan',
  '13664': 'South Sudan',
  '13536': 'Somalia', '13620': 'Somalia',
  '13566': 'Libya', '13726': 'Libya',
  '13611': 'Yemen',
  '13667': 'Central African Republic',
  '13413': 'Democratic Republic of the Congo', '13671': 'Democratic Republic of the Congo',
  '13882': 'Mali',
  '13441': 'Lebanon',
  '13303': 'Iraq', '13315': 'Iraq', '13350': 'Iraq', '13438': 'Iraq',
  '13851': 'Nicaragua',
  '14046': 'Ethiopia',
  '13936': 'Hong Kong',
  '13959': 'China', '14032': 'China',
}

// "E.O. 13902", "Executive Order 13902", "E.O.s 13553 and 13876" (first number).
const ORDER_CITATION = /\b(?:E\.\s?O\.|Executive Order)s?\s+(?:No\.\s+)?(\d{5})\b/g

// Countries of the single-country sanctions programs `text` cites, in
// first-cited order.
export function sanctionsProgramCountries(text: string): string[] {
  const countries = new Set<string>()
  for (const [, order] of text.matchAll(ORDER_CITATION)) {
    const country = COUNTRY_PROGRAM_ORDERS[order]
    if (country) countries.add(country)
  }
  return [...countries]
}
