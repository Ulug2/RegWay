// Which Claude model each AI job uses, in one place. A switch is one line
// here, made only after the job's accuracy was checked on the new model (as
// the regulatory judge's move to Haiku was, roadmap item 6.3).

export const SONNET = 'claude-sonnet-4-5'
export const HAIKU = 'claude-haiku-4-5'

export const MODEL_FOR = {
  chat: SONNET,
  impactAnalysis: SONNET,
  companyScan: SONNET,
  // A scanned SEC order, read from its images.
  secExtraction: SONNET,
  // One headline sentence from an SEC order's text, read in code (§17.8).
  secHeadline: HAIKU,
  // 40 of 40 verdicts agreed with Sonnet at temperature 0 (2026-10-05).
  regulatoryJudge: HAIKU,
  // Haiku linked sanctions on persons in a country to any company there.
  geopoliticalJudge: SONNET,
  enforcementJudge: SONNET,
  announcementMatch: HAIKU,
  // The second pass that challenges a match: reasoning-heavy, so Sonnet.
  skeptic: SONNET,
  // The chat check: finding the claims and comparing them with quoted
  // source text are mechanical; judging them against the facts is not.
  claimGate: HAIKU,
  citationCheck: HAIKU,
  // Web research on a firm after onboarding: searching and telling one
  // firm from another with a similar name both need judgement.
  firmResearch: SONNET,
} as const
