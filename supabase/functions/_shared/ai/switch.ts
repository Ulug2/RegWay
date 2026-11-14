// The owner's switch for AI work nobody explicitly asked for (2026-11-14:
// opening the dashboard after a top-up spent $4.80 on company scans and
// background analyses). With the AUTOMATIC_AI secret set to "off":
//
//   paused: company web scans, background analyses of new matches, the
//   matchers (scheduled, onboarding, dashboard load), duplicate grouping's
//   AI step, the SEC proceedings PDF reader, re-checks after profile edits.
//   still on: the chat, the analysis of a development someone opens, "this
//   match looks wrong" re-checks, web research on the firm. Each is a click.
//
// Unset or anything else: everything runs as normal.
//
//   supabase secrets set AUTOMATIC_AI=off   (pause)
//   supabase secrets unset AUTOMATIC_AI     (resume)

export const automaticAiPaused = (): boolean => Deno.env.get('AUTOMATIC_AI') === 'off'

// Can reach a user (a company page's scan message), so no setting names.
export const PAUSED_REASON = 'Automatic scans are paused for now.'
