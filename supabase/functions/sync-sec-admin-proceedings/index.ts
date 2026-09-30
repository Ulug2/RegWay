// NOT YET SCHEDULED / NOT PRODUCTION-READY (see migration
// 0015_unschedule_sec_admin_proceedings.sql): this function was observed to
// hang indefinitely — no response, no error — rather than fail fast when the
// SEC feed is unreachable or rate-limiting, during real-data testing. Root
// cause unconfirmed; this session had no access to edge-function server logs
// to diagnose further. The extraction logic itself (PDF -> Claude -> clean
// text) was verified correct in isolation. Needs that hang fixed and a fresh
// real-data verification pass before re-enabling the cron schedule. SEC
// litigation releases (`sync-sec-enforcement`) and FINRA enforcement
// (`sync-finra-enforcement`) are unaffected and already scheduled.
//
// Pulls new SEC Administrative Proceedings (the SEC's in-house enforcement
// track — orders instituting proceedings, settled orders, notices — as
// opposed to `sync-sec-enforcement`'s federal-court litigation releases) and
// upserts them into `regulations` with category 'enforcement'.
//
// Unlike litigation releases, every item here links to a PDF, not an HTML
// page (see prompts/23-enforcement-monitoring-investigate.md) — there's no
// cheap regex-based text extraction path for a PDF, so this function sends
// the PDF directly to Claude (native PDF document support) to extract a
// clean plain-text narrative and one-line headline. That's a real API cost
// (and several seconds) per new item, unlike the free litigation-release
// sync, which is why MAX_ITEMS is kept conservative here and the request
// runs synchronously rather than in the background (see processItems below).
//
//   curl -X POST https://<project-ref>.supabase.co/functions/v1/sync-sec-admin-proceedings \
//     -H "Authorization: Bearer <SERVICE_ROLE_OR_ANON_KEY>"

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { corsHeaders, handleOptions, json } from '../_shared/cors.ts'
import { parseRssItems, type FeedItem } from '../_shared/rss.ts'

const ADMIN_PROCEEDINGS_RSS = 'https://www.sec.gov/enforcement-litigation/administrative-proceedings/rss'
const MODEL = 'claude-sonnet-4-5'
// Conservative cap: each item costs a real Claude call (PDF extraction) that
// takes several seconds, run synchronously in the request (see below) — kept
// small enough that ordinary daily volume (a handful of genuinely new items)
// clears well within the request's execution budget. A larger one-time
// backlog just catches up over a few days rather than in one run.
const MAX_ITEMS = 6
// How many PDF-extraction calls run at once — keeps total wall-clock time
// bounded regardless of MAX_ITEMS, same pattern as `generateImpacts`.
const CONCURRENCY = 2
// SEC PDFs here are routinely well under 1MB; anything past this is almost
// certainly not a normal order (or the fetch went wrong) — skip the AI call
// rather than send an oversized/slow request, and still store the item with
// whatever the feed gave us so it isn't silently dropped.
const MAX_PDF_BYTES = 15 * 1024 * 1024

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function extractFromPdf(pdfBase64: string): Promise<{ headline: string; narrative_text: string } | null> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      tool_choice: { type: 'tool', name: 'submit_extraction' },
      tools: [
        {
          name: 'submit_extraction',
          description: 'Submit the extracted content of this SEC administrative proceeding document.',
          input_schema: {
            type: 'object',
            properties: {
              headline: { type: 'string', description: 'One neutral sentence (under 200 characters) summarizing what the document states — the charge, finding, or sanction — starting with the procedural posture if the document is a settled/consent order.' },
              narrative_text: {
                type: 'string',
                description:
                  'A clean plain-text rendering of the substantive content: procedural posture (e.g. contested order instituting proceedings, or settled/consent order with no admission or denial), factual background, the charges or findings, and any sanctions or remedies ordered. Exclude letterhead, signature blocks, and service/filing boilerplate.',
              },
            },
            required: ['headline', 'narrative_text'],
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: 'Extract this SEC administrative proceeding document per the submit_extraction tool.' },
          ],
        },
      ],
    }),
  })
  if (!res.ok) {
    console.error('admin-proceedings PDF extraction failed', res.status, await res.text())
    return null
  }
  const result = await res.json()
  const toolUse = (result.content ?? []).find((b: { type: string }) => b.type === 'tool_use')
  return toolUse?.input ?? null
}

async function buildRow(item: FeedItem) {
  let extracted: { headline: string; narrative_text: string } | null = null
  try {
    const pdfRes = await fetch(item.link, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'RegWay/1.0 (regulatory research; contact via app)' },
    })
    if (pdfRes.ok) {
      const buf = await pdfRes.arrayBuffer()
      if (buf.byteLength > 0 && buf.byteLength <= MAX_PDF_BYTES) {
        extracted = await extractFromPdf(toBase64(buf))
      }
    }
  } catch (err) {
    // Fall through and store the item from feed data alone — a failed
    // extraction shouldn't drop real, matchable coverage.
    console.error('admin-proceedings item extraction failed', item.creator, (err as Error).message)
  }

  return {
    source: 'sec_admin_proceedings' as const,
    category: 'enforcement' as const,
    external_id: item.creator,
    title: item.title,
    agency: 'Securities and Exchange Commission',
    jurisdiction: 'Federal',
    summary: (extracted?.headline || item.title).slice(0, 600),
    published_date: new Date(item.pubDate).toISOString().slice(0, 10),
    effective_date: null,
    source_url: item.link,
    raw: { order_number: item.creator, narrative_text: extracted?.narrative_text || null },
  }
}

// The PDF-fetch-plus-Claude-extraction work per item takes several seconds
// each. Tried backgrounding this via EdgeRuntime.waitUntil (the pattern
// `generateImpacts` uses elsewhere) so the request could return immediately,
// but that was observed to silently never complete here — even a small
// 6-item/concurrency-2 batch (should take well under a minute) never landed
// after several minutes, with no error surfaced. Running it synchronously
// instead, bounded by MAX_ITEMS/CONCURRENCY to stay well within the request's
// own execution budget, which a direct test confirmed completes reliably.
// This is fine for a cron-triggered sync that nothing is waiting on.
async function processItems(admin: SupabaseClient, newItems: FeedItem[]) {
  const queue = [...newItems]
  const rows: Awaited<ReturnType<typeof buildRow>>[] = []
  const worker = async () => {
    while (queue.length) {
      const item = queue.shift()!
      rows.push(await buildRow(item))
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  if (rows.length > 0) {
    const { error } = await admin.from('regulations').upsert(rows, { onConflict: 'source,external_id' })
    if (error) throw error
  }
  return rows.length
}

Deno.serve(async req => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const feedRes = await fetch(ADMIN_PROCEEDINGS_RSS, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'RegWay/1.0 (regulatory research; contact via app)' },
    })
    if (!feedRes.ok) throw new Error(`SEC administrative-proceedings feed returned ${feedRes.status}`)
    // Every real item carries an order number in `dc:creator` — used as the
    // external_id.
    const items = parseRssItems(await feedRes.text()).filter(i => i.creator).slice(0, MAX_ITEMS)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: existing } = await admin
      .from('regulations')
      .select('external_id')
      .eq('source', 'sec_admin_proceedings')
      .in('external_id', items.map(i => i.creator))
    const knownIds = new Set((existing ?? []).map(r => r.external_id))
    const newItems = items.filter(i => !knownIds.has(i.creator))

    const newCount = newItems.length > 0 ? await processItems(admin, newItems) : 0

    return json({ fetched: items.length, new: newCount })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
