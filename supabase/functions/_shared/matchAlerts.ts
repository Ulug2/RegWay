// The match alert email (send-match-alerts): the headlines of what newly
// matched the firm, its funds and its portfolio companies, each with what
// it applies to, and a way to the dashboard. No reasons or analyses: the
// email sends people to RegWay to read them (owner, 2026-11-14).
//
// One line per development even when it matched several entities ("Applies
// to: Harbor Capital, Fund II, Acme Corp").

export const SITE_URL = 'https://www.regwayai.com'

export interface AlertMatch {
  relevanceId: string
  regulationId: string
  title: string
  agency: string | null
  publishedDate: string | null
  // Who it applies to, e.g. "Harbor Capital" or "Fund II" or "Acme Corp".
  appliesTo: string
}

export interface AlertHeadline {
  regulationId: string
  title: string
  agency: string | null
  publishedDate: string | null
  appliesTo: string[]
}

// Newest first; one headline per development.
export function headlinesOf(matches: AlertMatch[]): AlertHeadline[] {
  const byRegulation = new Map<string, AlertHeadline>()
  for (const m of matches) {
    const h = byRegulation.get(m.regulationId) ?? { regulationId: m.regulationId, title: m.title, agency: m.agency, publishedDate: m.publishedDate, appliesTo: [] }
    if (!h.appliesTo.includes(m.appliesTo)) h.appliesTo.push(m.appliesTo)
    byRegulation.set(m.regulationId, h)
  }
  return [...byRegulation.values()].sort((a, b) => (b.publishedDate ?? '').localeCompare(a.publishedDate ?? ''))
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const developmentUrl = (id: string) => `${SITE_URL}/developments/${encodeURIComponent(id)}`

function dateLabel(date: string | null): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return null
  return new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

const metaOf = (h: AlertHeadline) => [h.agency, dateLabel(h.publishedDate)].filter(Boolean).join(' · ')

// `more`: headlines left out of a long email; the dashboard has them.
export function matchAlertEmail(firmName: string, headlines: AlertHeadline[], more = 0): { subject: string; text: string; html: string } {
  const n = headlines.length + more
  const subject = n === 1 && headlines.length === 1 ? `New for ${firmName}: ${headlines[0].title}`.slice(0, 160) : `${n} new developments for ${firmName}`
  const intro = n === 1 ? `RegWay found a new development that applies to ${firmName}.` : `RegWay found ${n} new developments that apply to ${firmName}.`

  const text = [
    intro,
    '',
    ...headlines.flatMap(h => [`• ${h.title}`, `  ${[metaOf(h), `Applies to: ${h.appliesTo.join(', ')}`].filter(Boolean).join(' — ')}`, `  ${developmentUrl(h.regulationId)}`, '']),
    ...(more ? [`…and ${more} more on your dashboard.`, ''] : []),
    `Open your dashboard for the reasons and analyses: ${SITE_URL}`,
    '',
    'You get these emails when something new matches your firm, a fund or a portfolio company. Turn them off in RegWay: Profile → Account → Email alerts.',
  ].join('\n')

  const items = headlines
    .map(
      h => `
              <tr>
                <td style="padding:14px 0;border-top:1px solid #EDEDED;">
                  <a href="${developmentUrl(h.regulationId)}" style="font-size:15px;line-height:22px;font-weight:600;color:#0A0A0A;text-decoration:none;">${escape(h.title)}</a>
                  ${metaOf(h) ? `<div style="margin-top:4px;font-size:13px;line-height:19px;color:#6B6B6B;">${escape(metaOf(h))}</div>` : ''}
                  <div style="margin-top:4px;font-size:13px;line-height:19px;color:#0369A1;">Applies to ${escape(h.appliesTo.join(', '))}</div>
                </td>
              </tr>`,
    )
    .join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F5F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0A0A0A;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(headlines.map(h => h.title).join(' · ').slice(0, 140))}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F5F5;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 4px 20px;">
              <a href="${SITE_URL}" style="text-decoration:none;color:#0A0A0A;">
                <img src="${SITE_URL}/logo-mark.png" width="28" height="28" alt="" style="vertical-align:middle;border:0;">
                <span style="vertical-align:middle;font-size:17px;font-weight:600;letter-spacing:-0.02em;padding-left:8px;">RegWay</span>
              </a>
            </td>
          </tr>
          <tr>
            <td style="background-color:#FFFFFF;border:1px solid #E5E5E5;border-radius:14px;padding:30px 28px;">
              <h1 style="margin:0 0 8px;font-size:21px;line-height:29px;font-weight:600;letter-spacing:-0.02em;color:#0A0A0A;">${n === 1 ? 'A new development for ' : `${n} new developments for `}${escape(firmName)}</h1>
              <p style="margin:0 0 14px;font-size:15px;line-height:23px;color:#333333;">${escape(intro)} Open RegWay to read why each one applies and what it means.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items}
              </table>${more ? `
              <p style="margin:6px 0 0;padding-top:14px;border-top:1px solid #EDEDED;font-size:14px;line-height:21px;color:#333333;">…and ${more} more on your dashboard.</p>` : ''}
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0;">
                <tr>
                  <td style="border-radius:10px;background-color:#0284C7;">
                    <a href="${SITE_URL}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;">Open your dashboard</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 4px 0;font-size:12px;line-height:18px;color:#8A8A8A;">
              You get these emails when something new matches your firm, a fund or a portfolio company. Turn them off in RegWay: <a href="${SITE_URL}/profile" style="color:#8A8A8A;">Profile → Account → Email alerts</a>.<br>
              RegWay · Regulatory intelligence for private equity · <a href="mailto:team@regwayai.com" style="color:#8A8A8A;">team@regwayai.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
  return { subject, text, html }
}
