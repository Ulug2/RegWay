# Matching scores

Each run of `pnpm eval:matching` against the hand-marked set (system guide
§17.1), newest first. No prompt or model change in `_shared/ai/models.ts` or
a judge's prompt merges with a worse score than the last one recorded here.

Record: the date, the set's name and size, the commit, the models, precision
and recall with the judges alone and with the Skeptic, the cost, and what
changed since the previous run.

## 2026-11-25: possible matches, and a second set (branch `feat/possible-matches`)

- **Changed:** the regulatory and geopolitical judges name a fact a
  document turns on, when it isn't recorded, as a yes/no question
  (`depends_on`, `_shared/possibleMatch.ts`). Those are saved as possible
  matches, not matches: precision and recall are unchanged in meaning, and
  a new line counts the possible ones: a missed match a question brings
  back, and a question about something that doesn't apply.
  **Models:** as `feat/new-models` (Sonnet 5.5 Skeptic and geopolitical
  judge); the regulatory judge as given. **Set:** "H.I.G. Capital,
  2026-11-25", 146 documents, 25 real matches.

| Run | Regulatory judge | Judges + Skeptic | Possible: found / about nothing | Cost |
|---|---|---|---|---|
| D1 | Haiku 4.5 | 66.7% / 32.0% (8, 4, 17) | 4 / 4 | $0.31 |
| D2 | Haiku 4.5 | 53.8% / 28.0% (7, 6, 18) | 4 / 7 | $0.28 |
| F1 | Haiku 5.5, effort low | 70.0% / 28.0% (7, 3, 18) | 4 / 5 | $0.17 |
| E1 | Haiku 5.5, effort medium (all jobs) | 70.0% / 28.0% (7, 3, 18) | 6 / 8 | $0.16 |
| E2 | Haiku 5.5, effort medium (all jobs) | 61.5% / 32.0% (8, 5, 17) | 4 / 10 | $0.17 |

- **What it adds:** every run brought back 4 to 6 of the missed matches
  as one question each: with one answer, 11 to 13 of the 25 instead of 7
  or 8. At a cost of 4 to 10 questions per 146 documents whose answer is
  no (each no is saved as a fact too).
- The questions read well, e.g. "Does H.I.G. Capital employ workers in the
  United Kingdom?" (UK employment law, twice), "Does A.L.A. S.p.A. ship or
  export defense articles on the U.S. Munitions List?" (ITAR), "Does A.L.A.
  S.p.A. import aircraft or engine parts into the United States?". The
  reason under a question does not always say what would apply if yes:
  the page labels it "For <entity>:".
- Recall with the Skeptic is a little under the last run (7 or 8 right,
  against 10): within what two runs vary by (D1 and D2 had the same
  prompt), and the possible matches more than make it up.
- **Second set:** "H.I.G. Capital, 2026-11-26"
  (`tests/eval/hig-2026-11-25-b.json`), 150 more documents none of which
  is in the first (`--exclude`), marked by Fable 5.2 for $2.98. The first
  set had taken every document production matched, so this one is the
  Skeptic's rejections (16), the judges' rejections (87, half from
  agencies near H.I.G.'s business; `--rejected 87`) and never-judged ones.
  **Only 6 of the 150 apply:** production's rejections were right about 96
  times in 100. Together: 296 documents, 31 real matches
  (`pnpm eval:matching <set> <set> --skeptic` scores them as one). Not yet
  scored together: the account reached its monthly API limit (until
  2026-12-01) as these runs started.

## 2026-11-25: off Sonnet 4.5 (branch `feat/new-models`)

- **Why:** Sonnet 4.5 retires on 2026-11-30. Every Sonnet job moves to
  Sonnet 5.5 (geopolitical and enforcement judges, Skeptic, analyses,
  chat, research, scans). Claude 5 requests are reshaped in one place
  (`_shared/ai/modelRules.ts`: no temperature, the forced tool becomes a
  JSON format, effort `low`). The regulatory judge was also tried on the
  Claude 5 models. **Set:** "H.I.G. Capital, 2026-11-25", 146 documents.
  (right, shown wrongly, missed) in brackets.

| Run | Regulatory judge | Judges alone | Judges + Skeptic | Cost |
|---|---|---|---|---|
| A1 | Haiku 4.5 (kept) | 44.0% / 44.0% (11, 14, 14) | 62.5% / 40.0% (10, 6, 15) | $0.32 |
| B1 | Haiku 5.5 | 81.8% / 36.0% (9, 2, 16) | 60.0% / 12.0% (3, 2, 22) | $0.15 |
| B2 | Haiku 5.5 | 66.7% / 24.0% (6, 3, 19) | 72.7% / 32.0% (8, 3, 17) | $0.15 |
| C1 | Sonnet 5.5 | 88.9% / 32.0% (8, 1, 17) | 83.3% / 20.0% (5, 1, 20) | $0.36 |
| C2 | Sonnet 5.5 | 100% / 24.0% (6, 0, 19) | 71.4% / 20.0% (5, 2, 20) | $0.38 |

- **Kept:** Haiku 4.5 for the regulatory judge (not retiring). With the
  Skeptic on Sonnet 5.5 it scores as before the move (last run, Sonnet
  4.5: 66.7% / 40.0%, 10 right, 5 wrong; now 10 right, 6 wrong), for about
  two thirds of the cost.
- **The Claude 5 judges** are far more precise alone (1 to 3 wrong instead
  of 14) but find fewer, and vary much more from run to run: without
  temperature 0, B found 9 and then 6. Not switched: two runs can't tell
  them apart from Haiku 4.5 on 25 real matches.
- B1's Skeptic took back 6 of 9: read on a separate run, it kept all 4 of
  the matches the judge gave it. Run-to-run variation, not a harsher
  Skeptic.

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
