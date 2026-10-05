# Haiku vs Sonnet verdict accuracy (roadmap item 6.3)

## Prompt

> Fix that then move to roadmap

(After fixing chat message order and settling item 1, the owner chose, for
item 6: keep pre-writing analyses, keep matching off the Batch API, and run
the ≈ $0.30 Haiku accuracy test.)

## Method

- `match-relevance`'s prompt moved verbatim into
  `_shared/regulatoryJudge.ts` (`judgeRegulations`); it and
  `judgeGeopolitical` take an optional `model`. Production unchanged
  (Sonnet 4.5).
- `usage.ts` prices by model (Haiku 4.5 $1/$1.25/$0.10/$5), so a Haiku call
  isn't logged at Sonnet prices.
- A temporary function (`zz-model-compare`, deleted) ran a fixed list
  through one model and returned verdicts, writing nothing but usage rows
  (`function_name = 'model-compare'`).
- Items: H.I.G., per matcher, every item production marked relevant plus
  the newest rejections, 40 in total (regulatory: 14 relevant; geopolitical:
  2), sorted by id so both models saw the same numbered list.

## Results ($0.268)

| Agreement out of 40 | Regulatory | Geopolitical |
|---|---|---|
| Haiku vs fresh Sonnet | 38 | 39 |
| Sonnet run 1 vs run 2 | 38 | — |
| Fresh Sonnet vs stored | 27 | 39 |
| Haiku vs stored | 29 | 38 |

- Haiku's 2 extra regulatory yes verdicts were speculative (Florida SIP
  "applies to H.I.G.'s operations in Florida"; Medicaid rule GetixHealth
  "may" bill for). It missed Sonnet's one geopolitical yes (aircraft-import
  proclamation × A.L.A.).
- 13 of 14 stored regulatory matches did not reproduce on a fresh Sonnet
  run, against ~2/40 run-to-run noise. Not resolved: batch context or a
  profile edit since. Not switched; decisions left to the owner.
