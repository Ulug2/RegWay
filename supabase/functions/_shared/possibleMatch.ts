// A possible match: a document that would apply to the firm, a fund or a
// company if one fact that is not recorded were true ("Does A.L.A. ship
// defense articles?"). Before, the judges marked those not relevant and they
// were never seen: most of the matches the first scored test set missed
// turned on such a fact (UK staff, imports, cobalt; plans/eval-history.md).
//
// A judge now names that fact as a yes/no question. The verdict is saved as
// not relevant, so it stays off the dashboard, out of alert emails and
// analyses, with the question in front of the reason:
//   "NOT_RELEVANT: Possible: <question>\n<reason>"
// The dashboard lists them apart; a member's answer (migration 0055) saves
// the fact to the entity's other facts, which every matcher reads, and a
// yes turns the row into a match.

export const POSSIBLE_PREFIX = 'NOT_RELEVANT: Possible: '

export const possibleReason = (question: string, reason: string) => `${POSSIBLE_PREFIX}${question.trim().replace(/\s+/g, ' ')}\n${reason}`

// What the judges are told, after their own rules.
export const POSSIBLE_RULE = `When a document would apply to a specific entity only if ONE fact that is not recorded about it is true, and what is recorded points towards that fact (an aerospace and defense logistics company and a rule on exporting defense articles, when whether it ships such articles is not recorded; a firm with a London office and a UK employment law, when its UK staff are not recorded), mark it not relevant for that entity, and put the fact in depends_on as one short yes/no question about the entity, naming it ("Does A.L.A. S.p.A. ship defense articles?"). Name the entity in scope and entity_name as for a match, and write the reason as what the document would require of the entity if the answer is yes. Leave depends_on empty when the verdict is relevant, when a recorded fact already rules the entity out, and when nothing recorded points towards the fact.`

export const DEPENDS_ON_FIELD = {
  type: 'string',
  description: 'Only for a not-relevant verdict that turns on one unrecorded fact pointed to by what is recorded: that fact as a yes/no question naming the entity. Else empty string.',
}
