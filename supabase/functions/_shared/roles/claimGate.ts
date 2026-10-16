// The chat check's first step: does this answer claim that something applies
// (or does not apply) to the firm, one of its funds, or one of its
// portfolio companies? Most answers explain a rule or summarise a list and
// make no such claim; they need no further check and cost only this one
// small call. Each claim found is handed to the Skeptic and the citation
// check (regway-ai-chat/review.ts).

import type { CallOptions } from '../ai/client.ts'
import { MODEL_FOR } from '../ai/models.ts'
import { runTool, type ToolSpec } from '../ai/structured.ts'
import type { EntityScope } from './entityContext.ts'

const MODEL = MODEL_FOR.claimGate
const MAX_CLAIMS = 6
const ANSWER_CHARS = 12_000

export interface ApplicabilityClaim {
  // The claim as one self-contained sentence, close to the answer's words.
  claim: string
  // Whether the answer says it applies or that it does not.
  kind: 'applies' | 'does_not_apply'
  scope: EntityScope
  entity_name: string | null
}

const TOOL: ToolSpec = {
  name: 'submit_claims',
  description: 'List the applicability claims the answer makes about the firm, its funds or its portfolio companies.',
  input_schema: {
    type: 'object',
    properties: {
      claims: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            claim: { type: 'string', description: 'One self-contained sentence stating the claim, close to the answer\'s own words, naming the rule and the entity.' },
            kind: { type: 'string', enum: ['applies', 'does_not_apply'] },
            scope: { type: 'string', enum: ['firm', 'fund', 'company'] },
            entity_name: { type: 'string', description: 'Exact fund or company name from the list, or empty string for the firm.' },
          },
          required: ['claim', 'kind', 'scope', 'entity_name'],
        },
      },
    },
    required: ['claims'],
  },
}

const INSTRUCTIONS = `Read the assistant's answer below. List every place where it claims that a specific rule, regulation, enforcement action, sanction or other development applies to, affects, creates an obligation for, or does not apply to the firm, one of its funds, or one of its portfolio companies (named, or meant by "you", "your firm", "your fund", "the company").

Do not list:
- explanations of what a rule says or requires in general, with no claim about these entities;
- restatements that RegWay has matched something, without a new claim of why it applies;
- questions, suggestions to check with counsel, or hypotheticals ("if a company did X").

Return at most ${MAX_CLAIMS} claims, the most consequential first. If there are none, return an empty list.`

export async function findApplicabilityClaims(
  input: { question: string; answer: string; firmName: string; funds: string[]; companies: string[] },
  opts: CallOptions,
): Promise<ApplicabilityClaim[]> {
  const known = new Map<string, EntityScope>([...input.funds.map(n => [n.toLowerCase(), 'fund'] as const), ...input.companies.map(n => [n.toLowerCase(), 'company'] as const)])
  const answer = await runTool<{ claims: (Omit<ApplicabilityClaim, 'entity_name'> & { entity_name: string })[] }>(
    {
      model: MODEL,
      max_tokens: 1500,
      temperature: 0,
      tool: TOOL,
      messages: [
        {
          role: 'user',
          content: `${INSTRUCTIONS}

Firm: ${input.firmName}
Funds: ${input.funds.join('; ') || 'none'}
Portfolio companies: ${input.companies.join('; ') || 'none'}

QUESTION
${input.question}

ANSWER
${input.answer.slice(0, ANSWER_CHARS)}`,
        },
      ],
    },
    opts,
  )
  // A claim about an entity the firm does not have is about the firm.
  return (answer.claims ?? []).slice(0, MAX_CLAIMS).map(c => {
    const scope = c.scope !== 'firm' && c.entity_name && known.get(c.entity_name.toLowerCase()) === c.scope ? c.scope : 'firm'
    return { claim: c.claim, kind: c.kind, scope, entity_name: scope === 'firm' ? null : c.entity_name }
  })
}
