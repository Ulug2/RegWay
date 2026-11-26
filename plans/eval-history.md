# Matching scores

Each run of `pnpm eval:matching` against the hand-marked set (system guide
§17.1), newest first. No prompt or model change in `_shared/ai/models.ts` or
a judge's prompt merges with a worse score than the last one recorded here.

Record: the date, the set's name and size, the commit, the models, precision
and recall with the judges alone and with the Skeptic, the cost, and what
changed since the previous run.

## 2026-11-26: the judges read every recorded fact (branch `feat/judges-full-profiles`)

- **Changed:** the regulatory and enforcement judges read each entity's
  full facts (`entityList`, `_shared/entityFacts.ts`: what the Skeptic
  reads, plus the firm's offices and a company's products, facilities
  and trade regions), with the facts that matter stated as not recorded.
  Before: sectors, regions and a one-line description. The Skeptic is
  unchanged. The geopolitical judge is unchanged (it reads footprints).

| Run | Judges alone: precision / recall | Judges + Skeptic: precision / recall | Cost |
|---|---|---|---|
| A: the Skeptic also given the new facts | 42.9% / 48.0% (12, 16, 13) | 80.0% / 32.0% (8, 2, 17) | $0.39 |
| B: the Skeptic unchanged (this change) | 40.7% / 44.0% (11, 16, 14) | 66.7% / 40.0% (10, 5, 15) | $0.40 |

- **Noise:** the judges' prompt was identical in A and B, yet they found 12
  and then 11 matches. With 25 real matches in the set, one match moves
  recall by 4 points: differences of one or two matches are not a result.
- **What did change:** of seven hard documents that turn on what a company
  makes or where it is, the judges alone found 1 with the old description
  and 2 and 3 with the full facts (A.L.A. on the US aircraft-parts
  tariffs both times, ITAR once).
- In A the Skeptic, given the new facts, took back four real matches the
  judges had found (A.L.A. on the aircraft-parts tariffs and ITAR,
  Brightwell on FCA transaction reporting, GetixHealth on the physician
  fee schedule), all four marked medium confidence because they turn on a
  fact the profile doesn't record. So the Skeptic keeps its facts for now.
- To tell smaller changes apart: a larger set, or each version run twice.

## 2026-11-26: names found when shortened (branch `fix/entity-names`)

- **Set:** as below. **Models:** unchanged. **Changed:** a fund or
  company is found even under a shortened name (`_shared/entityNames.ts`),
  when saving a match, in the geopolitical judge, the Skeptic and the
  scoring; a name still not found is no longer saved as the firm's match.

| | Precision | Recall | Right / shown wrongly / missed | Documents exactly right | Cost |
|---|---|---|---|---|---|
| Judges alone | 40.7% | 44.0% | 11 / 16 / 14 | 123 of 146 | $0.16 |
| Judges + Skeptic | 71.4% | 40.0% | 10 / 4 / 15 | 132 of 146 | $0.24 |

- Left, with the Skeptic: 6 of the 15 misses are UK employment law the
  marker gave to the firm, Brightwell and A.L.A. on their London presence
  (UK staff are not recorded: debatable); the rest are the EU Customs
  Code and the cobalt-exposure directive (Rheintal, A.L.A.), A.L.A. on US
  aircraft-parts tariffs, ITAR and the end of IEEPA tariffs, the Hazard
  Communication Standard (Cascade), and the firm on the FCA
  client-categorisation rule and EU investment screening. Wrongly shown:
  the SEC retail private-markets proposal (firm), two FCA items for
  Brightwell, a UK fund-scheme amendment for H.I.G. Europe Partners.

## 2026-11-25: first score (`main` at 08cb759)

- **Set:** "H.I.G. Capital, 2026-11-25" (`tests/eval/hig-2026-11-25.json`),
  146 documents (111 regulatory, 35 geopolitical), marked by Claude Fable
  5.2 at extra-high effort ($3.40; 101 marks high confidence, 41 medium,
  4 low). 19 documents apply to something.
- **Models:** regulatory judge Haiku 4.5; geopolitical judge and Skeptic
  Sonnet 4.5.

| | Precision | Recall | Right / shown wrongly / missed | Documents exactly right | Cost |
|---|---|---|---|---|---|
| Judges alone | 20.5% | 32.0% | 8 / 31 / 17 | 113 of 146 | $0.15 |
| Judges + Skeptic | 36.4% | 32.0% | 8 / 14 / 17 | 125 of 146 | $0.28 |

- **Read with care:** 11 of the judges' 31 "shown wrongly" name the right
  company but drop part of its name ("Brightwell Wealth" for "Brightwell
  Wealth (test)", "A.L.A. S.p.A." for "A.L.A. S.p.A. (Advanced Logistics
  for Aerospace)"), so each also counts as missed. Production has the same
  fault: `buildRelevanceRows` (`_shared/relevance.ts`) finds the entity by
  its exact name, and a name it can't find is saved as a match for the
  firm (two such rows on H.I.G.: the FCA transaction-reporting
  consultation and the EU cobalt-exposure directive). Fixing that comes
  first; the next score shows how much of the gap it closes.
- What the marks say about production (`pnpm eval:mark compare`): of 21
  matches, 7 name exactly the right entities; the Skeptic was right on 29
  of its 33 rejections; the judges' rejections were right on 56 of 57;
  33 of 35 never-judged documents apply to nothing.
