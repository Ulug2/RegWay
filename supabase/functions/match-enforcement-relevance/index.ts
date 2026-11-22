// Matches enforcement actions (SEC litigation releases, SEC administrative
// proceedings, and FINRA disciplinary actions today; any future
// `category: enforcement` source tomorrow) to a firm's funds and portfolio
// companies. Deliberately a separate function from match-relevance, not a
// shared prompt: a regulation is matched against jurisdiction/sector, but an
// enforcement action is a case against someone else entirely —
// relevance here means a genuine, factual overlap between the conduct
// alleged and the entity's own activity (same instrument, customer type, or
// practice), never a shared industry label, and the verdict reasoning must
// never imply the entity itself did anything wrong. See _shared/relevance.ts
// for the auth/rate-limit/entity-loading plumbing shared with match-relevance.
//
//   POST /functions/v1/match-enforcement-relevance   {}
//   Authorization: Bearer <user session access_token>   — matches the caller's own firm
//
// Or, for cron/admin use across all firms:
//   POST /functions/v1/match-enforcement-relevance   { "firmId": "<uuid>" }
//   Authorization: Bearer <service role key>

import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { generateImpacts } from '../_shared/impact.ts'
import { corsHeaders, handleOptions, json } from '../_shared/cors.ts'
import { resolveFirmContext, loadFirmEntities, describe, checkRateLimit, buildRelevanceRows, upsertRelevanceRows, type Verdict, forgetRejections, requestScheduledRematch, olderUnjudged } from '../_shared/relevance.ts'
import { callClaude, toolInput } from '../_shared/ai/client.ts'
import { MODEL_FOR } from '../_shared/ai/models.ts'
import { FENCE_RULE, untrusted } from '../_shared/security/guard.ts'
import { automaticAiPaused } from '../_shared/ai/switch.ts'

const MODEL = MODEL_FOR.enforcementJudge
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const BATCH_SIZE = 40
const rateLimited = () => json({ error: 'Rate limit exceeded. Please try again later.' }, 429)
// Enough of the narrative to judge a real overlap in conduct without
// spending the whole context budget on one case out of up to 40 per batch.
const CASE_EXCERPT_CHARS = 1200

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // `{ reevaluate: true }`: re-check recent rejections after a profile edit.
    const body = await req.clone().json().catch(() => ({}))
    const ctx = await resolveFirmContext(req, admin)
    if (ctx instanceof Response) return ctx
    const { firmId, rateLimitClient } = ctx

    const { firm, funds, companies } = await loadFirmEntities(admin, firmId)
    if (!firm) return json({ error: 'Firm not found' }, 404)

    // Enforcement items not yet evaluated for this firm (no relevance row of
    // any kind — including the "not relevant" marker rows, see below).
    const columns = 'id, title, agency, summary, raw'
    const { data: newest } = await admin
      .from('regulations')
      .select(columns)
      .eq('category', 'enforcement')
      .order('published_date', { ascending: false })
      .limit(200)
    const candidates = newest ?? []

    // After an edit to a fact this matcher uses: judge the recent items it
    // had rejected again (this window only). One batch per call: the caller
    // repeats the call until a short batch comes back, and scheduled runs
    // finish the job for an enrolled firm. The rate limit is checked before
    // anything is forgotten, so a refused call changes nothing.
    const reevaluate = body?.reevaluate === true
    if (reevaluate) {
      if (rateLimitClient && !(await checkRateLimit(rateLimitClient, 'match-enforcement-relevance', 15, 60))) return rateLimited()
      await forgetRejections(admin, firmId, candidates.map(c => c.id))
      await requestScheduledRematch(admin, firmId)
    }

    const { data: alreadyEvaluated } = await admin
      .from('regulation_relevance')
      .select('regulation_id')
      .eq('firm_id', firmId)
      .in('regulation_id', candidates.map(c => c.id))

    const evaluatedIds = new Set((alreadyEvaluated ?? []).map(r => r.regulation_id))
    const recent = candidates.filter(c => !evaluatedIds.has(c.id)).slice(0, BATCH_SIZE)
    // Older cases the window no longer reaches fill the rest of the batch.
    const older = await olderUnjudged<(typeof candidates)[number]>(admin, firmId, { category: 'enforcement', columns }, candidates.map(c => c.id), BATCH_SIZE - recent.length)
    const unevaluated = [...recent, ...older]

    if (unevaluated.length === 0) return json({ evaluated: 0, relevant: 0 })
    // Judged once the owner resumes automatic AI work (_shared/ai/switch.ts).
    if (automaticAiPaused()) return json({ evaluated: 0, relevant: 0, paused: true })

    if (rateLimitClient && !reevaluate && !(await checkRateLimit(rateLimitClient, 'match-enforcement-relevance', 15, 60))) return rateLimited()

    const firmProfile = describe(firm.profile, [
      ['firm_type', 'firm type'],
      ['adviser_registration', 'adviser registration'],
      ['strategies', 'strategies'],
      ['industries', 'industries'],
      ['geographies', 'geographies'],
    ])

    const fundDetail = (profile: Record<string, unknown> | null) =>
      describe(profile, [
        ['status', 'status'],
        ['strategy', 'strategy'],
        ['ownership', 'ownership'],
        ['priority_areas', 'priority areas'],
      ])

    const fundList =
      (funds ?? []).map(f => `- ${f.name} (${f.structure ?? 'structure n/a'}${fundDetail(f.profile) ? '; ' + fundDetail(f.profile) : ''})`).join('\n') || 'none on file'
    const companyList =
      (companies ?? []).map(c => `- ${c.name} (sectors: ${(c.sectors ?? []).join('/')}, regions: ${(c.regions ?? []).join('/')}${c.offerings ? `; does: ${c.offerings}` : ''})`).join('\n') ||
      'none on file'

    const caseExcerpt = (r: { title: string; agency: string | null; summary: string | null; raw: Record<string, unknown> | null }) => {
      const narrative = (r.raw?.narrative_text as string | undefined) ?? ''
      const excerpt = narrative ? narrative.slice(0, CASE_EXCERPT_CHARS) : (r.summary ?? 'no summary')
      return `${r.title} — ${excerpt}`
    }
    const caseList = untrusted('SEC and FINRA enforcement releases', unevaluated.map((r, i) => `${i}. [${r.agency ?? 'SEC/FINRA'}] ${caseExcerpt(r)}`).join('\n\n'))

    const result = await callClaude({
      model: MODEL,
      max_tokens: 4096,
      // Verdicts, not prose: the same item should get the same answer on
      // every run (at the default temperature borderline items flipped).
      temperature: 0,
      tool_choice: { type: 'tool', name: 'submit_verdicts' },
      tools: [
        {
          name: 'submit_verdicts',
          description: 'Submit a relevance verdict for every numbered enforcement case.',
          input_schema: {
            type: 'object',
            properties: {
              verdicts: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    index: { type: 'integer' },
                    relevant: { type: 'boolean' },
                    reason: {
                      type: 'string',
                      description:
                        "One sentence naming the specific factual overlap (same instrument, customer type, or practice) between the case and this entity's own activity. Never state or imply the entity is involved in the case.",
                    },
                    scope: { type: 'string', enum: ['firm', 'fund', 'company'] },
                    entity_name: { type: 'string', description: 'Exact fund or company name if scope is fund/company, else empty string' },
                  },
                  required: ['index', 'relevant', 'reason', 'scope'],
                },
              },
            },
            required: ['verdicts'],
          },
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              cache_control: { type: 'ephemeral' },
              text: `Firm: ${firm.name}, headquartered in ${firm.hq_location ?? 'unknown'}.${firmProfile ? `
Firm profile — ${firmProfile}.` : ''}

Funds:
${fundList}

Portfolio companies:
${companyList}

Below are numbered SEC and FINRA enforcement actions (litigation releases, administrative proceedings, and disciplinary actions) against named respondents/defendants who are NOT this firm, its funds, or its portfolio companies. Some are contested and pending (allegations only); others are settled or concluded (the source's stated findings, often via a consent order where the respondent neither admits nor denies them) — treat each with whatever certainty its own text states, never more.

For each one, decide whether it is meaningfully relevant background awareness for this firm, a fund, or a portfolio company — meaning the alleged conduct (the instrument sold, the customer type targeted, the practice used, the role played) genuinely overlaps with that specific entity's own described activity. A shared label like "both are in financial services" or "both are private funds" is NOT sufficient — you must be able to name the specific concrete practice or activity in common. Be strict: most enforcement actions will not be relevant to most entities. If you cannot point to a real overlap in what was actually done, mark it not relevant.

Never write a reason that could be read as saying the firm, a fund, or a portfolio company did something wrong, was investigated, or is connected to the people or entities named in the case — they are not. The only permissible relevance is "this case involves conduct, an instrument, or a practice similar to what this entity does," stated neutrally.

${FENCE_RULE}`,
            },
            { type: 'text', text: caseList },
          ],
        },
      ],
    }, { usage: { admin, functionName: 'match-enforcement-relevance', firmId } })

    const verdicts: Verdict[] = toolInput<{ verdicts?: Verdict[] }>(result, 'submit_verdicts')?.verdicts ?? []

    const rows = buildRelevanceRows(verdicts, unevaluated, firmId, funds, companies)
    await upsertRelevanceRows(admin, rows)

    const relevantCount = verdicts.filter(v => v.relevant).length

    // Prepare the enforcement-aware impact summary for newly relevant items in
    // the background so it's ready before anyone opens them (same path
    // match-relevance uses; _shared/impact.ts branches its prompt by
    // regulation.category).
    const newlyRelevantIds = [...new Set(verdicts.filter(v => v.relevant).map(v => unevaluated[v.index]?.id).filter((id): id is string => !!id))]
    if (newlyRelevantIds.length > 0) EdgeRuntime.waitUntil(generateImpacts(newlyRelevantIds, firmId))

    return json({ evaluated: rows.length, relevant: relevantCount })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
