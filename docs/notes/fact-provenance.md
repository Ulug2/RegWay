# Fact provenance and "last confirmed" dates (roadmap item 16), 2026-10-08

## What the spec asks (docs/product/Regway_AI_Features_and_User_Journey.docx)

- "Every important matching fact should have an identifiable origin, such
  as user-provided information or a supporting document, and a date showing
  when it was last confirmed or updated."
- "Missing information should remain visibly unknown. If the user has not
  entered supplier locations, the system cannot say that the company has no
  suppliers in an affected region."

## Audit

- Every fact RegWay holds about a firm, fund or company is typed in by a
  user (signup, the "add" cards, Profile). Nothing is read from a document
  or a website, so "origin" today is always the user; a document can only
  be something the user names.
- `profile` (jsonb) is read as plain values by the matchers, the footprints,
  the analyses, the chat and the client. The only date was the whole row's
  `profile_updated_at`.
- A blank optional answer showed no marker; `facts()` (the entity line for
  analyses and chat) dropped blanks silently.

## Design

- **Storage: `profile_meta` beside `profile`** (migration 0034), one entry
  per answer: `{ source: 'user' | 'document', document?, confirmed_at }`.
  The roadmap sketched wrapping each value inside `profile`; that would
  have changed every reader of `profile` for no gain. Readers are untouched.
- **Stamping** happens in `toRow` (the one write funnel), which now gets the
  row as it was: an answer entered or changed is stamped now; an unchanged
  one keeps its entry; a cleared one loses it. An answer from before this
  existed stays undated ("Recorded on or before <last save>") until someone
  confirms it: saving something else is not a confirmation.
- **Profile forms** (not signup or "add" cards): under each answer, where it
  came from and when it was confirmed; "Still correct" on undated answers
  and ones over a year old; "Add document" to name the document an answer
  rests on (a name or a link; editing the answer drops it). "Confirm all
  answers are current" per card. A blank optional fact is badged "Unknown";
  the card header counts answers over a year old. Preferences and feature
  switches (monitoring preferences, optional extras, teams, goals) are
  settings, not facts, and carry none of this.
- **AI** (`_shared/entityFacts.ts`, used by analyses and chat): a blank fact
  that would change a conclusion is listed as "not recorded" (firm:
  adviser registration, legal domicile, strategies; fund: status, strategy,
  ownership; company: where it operates, supplier locations, customers,
  consumer-facing, sensitive data, regulated, government contracts, trade,
  outside the U.S.), and a fact over a year old is marked "(last confirmed
  <date>)". One sentence tells the model how to read both.

## Live check

Regenerated the ITAR analysis for A.L.A. S.p.A. on H.I.G. ($0.08). Its only
blank fact of that kind is supplier locations. Before: not mentioned.
After: "The company's supplier locations are not recorded, so exposure
through its own supply chain cannot be assessed", and a matching open
question. Nothing on H.I.G. is over a year old, so the "last confirmed"
marker is covered by unit tests only.

## Left open

- A "document" is a name or link the user types. There is no upload, and
  nothing checks the document says what the answer says.
- Which user entered or confirmed an answer is not recorded.
- The matchers' own prompts are unchanged (they already say NOT RECORDED
  for locations); only analyses and chat read the new markers.
- A development's page does not show the dates of the facts its match
  rests on.
- Noticed, not changed: `regulation_impacts.created_at` keeps its first
  value when an analysis is regenerated.
