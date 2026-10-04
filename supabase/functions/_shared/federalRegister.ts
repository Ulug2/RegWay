// Where a Federal Register document's full text can be read, in the order to
// try them. Shared by sync-federal-register (countries from the body) and
// _shared/impact.ts (the text an analysis is written from).
//
// 1. Federal Register's own plain-text copy: the same path as the API's
//    `raw_text_url`, cheapest to strip.
// 2. GovInfo, the Government Publishing Office's official copy of the same
//    issue. Federal Register redirects automated clients to a CAPTCHA page
//    (unblock.federalregister.gov) for every document URL once it decides a
//    client is automated; GovInfo doesn't, and carries same-day documents
//    and corrections (C1-...) too. Its .htm is the text in a <pre> block.
// 3. The Federal Register HTML page, last: it's behind the same CAPTCHA.

export interface FederalRegisterDocumentRef {
  document_number: string
  publication_date: string // YYYY-MM-DD
  html_url?: string
}

export const federalRegisterTextUrl = (doc: FederalRegisterDocumentRef) =>
  `https://www.federalregister.gov/documents/full_text/text/${doc.publication_date.replaceAll('-', '/')}/${doc.document_number}.txt`

export const govInfoTextUrl = (doc: FederalRegisterDocumentRef) =>
  `https://www.govinfo.gov/content/pkg/FR-${doc.publication_date}/html/${doc.document_number}.htm`

export const federalRegisterTextUrls = (doc: FederalRegisterDocumentRef): string[] =>
  [federalRegisterTextUrl(doc), govInfoTextUrl(doc), doc.html_url].filter((u): u is string => !!u)
