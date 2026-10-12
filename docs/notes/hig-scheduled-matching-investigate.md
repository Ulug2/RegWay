# Scheduled matching for H.I.G. + live AI tests — investigate

Roadmap: `plans/regway-mvp-roadmap.md` → "Live AI tests still owed",
item 9.5, and the scheduled-matching note under Context.

## Prompt

> Okay use the AI on test account that has H.I.G account. So ignore other
> accounts. That's our primary test account. So test the AI and what u
> built on that account only also turn schedule matching back for HIG

## State found

| Piece | State |
|---|---|
| H.I.G. Capital | Firm `b3eb450e-…`, 2 funds, 3 companies (3Pillar Global, GetixHealth, A.L.A.), no fund holdings recorded, one user. |
| `run-matching` | Runs every row in `firms`; cron `run-matching-30min` inactive since the owner paused it. |
| H.I.G. backlog | Regulatory 199 of the newest 200 unevaluated, enforcement 47 of 47; geopolitical 0 (its 111 candidates were already judged on dashboard loads). ≈ 6–7 batches at $0.05–0.08. |
| Access | Matchers, `rematch-regulation`, `refresh-entity-impacts` accept the service key + `firmId`. Chat, company scan and `regulation-impact` need a user session. |

## Plan

1. Enrolment table `scheduled_matching_firms` (not a `firms` column:
   members can update their own firm row, and this flag spends money);
   RLS on, no policies. Enrol H.I.G.
2. `run-matching` reads firms from it; enrolling counts as new work.
3. Force one run, check verdicts, analyses and cost; re-enable cron.
4. Run the service-key-testable AI paths on H.I.G. (re-checks). The
   user-session paths are left to a click-through by the H.I.G. user.
