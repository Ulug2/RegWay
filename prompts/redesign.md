# Redesign with the five frontend add-ons (roadmap 16d)

2026-10-08. Owner's request: "install all of them. Then redesign our app
from what you learned from those plugins. But keep the same colors and
improve everything else." Branch: `redesign` (not merged). The rules that
came out of it are in `DESIGN.md`.

## What was installed

| Add-on | Where | How it was used |
|---|---|---|
| Taste Skill (14 skills from `Leonxlnx/taste-skill`) | `.claude/skills/`, versions in `skills-lock.json` | `redesign-existing-projects` and `design-taste-frontend` supplied the audit list and the order of work |
| Web Design Guidelines (`vercel-labs/agent-skills`) | `.claude/skills/web-design-guidelines` | Its rule list (fetched from GitHub when run) was the accessibility and interaction audit |
| Image to Code (part of the Taste Skill repo) | `.claude/skills/image-to-code` | Not used: it needs an image generator. One rule was taken from it: no fake product screenshots built out of boxes |
| Awesome Design (`VoltAgent/awesome-design-md`) | Nothing kept in the repo; `npx getdesign@latest add <site>` fetches a file | The format of `DESIGN.md`. Three reference files (Linear, Stripe, Vercel) were read, not copied |
| Playwright CLI (`@playwright/cli`, global) | `.claude/skills/playwright-cli`; `.playwright-cli/` is gitignored | Checking the running local site. Screens are shot by `tests/e2e/capture.spec.ts`, which uses the mock backend |

The skills are instructions written by third parties and run with the
agent's permissions. They were read before use. Nothing in them was followed
beyond design guidance.

## How the work was ordered

The Taste skill's redesign protocol: classify the job (here "preserve": keep
the brand, modernise), audit before touching, then pull levers in order of
value per risk: type, spacing, colour, motion, recomposing key sections,
replacing blocks. Colour was skipped on the owner's instruction, apart from
text contrast.

Its "design read" for RegWay: a tool for compliance and deal people, calm
and exact; variance 4, motion 3, density 5.

## What the audit found, and what was done

**Type**
- Inter everywhere, via a render-blocking Google Fonts import. Now Geist and
  Geist Mono, bundled.
- Reading text at 12px (card summaries, reasons, helper text). Now 14 to
  15px for prose, 13px for helpers, nothing under 12px.
- Small-caps labels above every block.
  Now sentence-case headings.
- Raw dates ("2027-01-01") and raw source ids ("federal_register"). Now
  "Jan 1, 2027" and "Federal Register".

**Layout**
- Landing: centred hero, three equal cards, zig-zag step cards, a cloud of
  18 pills, a centred call to action. Now: copy left and a real product
  picture right; three reasons as a ruled list beside a statement; steps in
  a row; sources grouped by region; a left-aligned call to action. Each
  section has a different layout.
- Dashboard: three large equal buttons. Now one bar with counts, the open
  level marked.
- Development page: five pill actions and a call to action wrapping onto two
  rows, three stacked side cards, a control that did nothing. Now one action
  row, one side card, the dead control removed.
- Three different page headers (logo left, logo right, different heights and
  button shapes). Now one (`PageHeader.tsx`).
- Phone: the setup reminder, the level buttons and the footer broke at 390px.
  Fixed.

**Controls**
- Buttons, tabs and labels were styled inline, each a little differently
  (pills and 12px rounded rectangles mixed). Now one set of classes and one
  shape rule (pressable = pill, static label = 6px).
- About 40 hand-drawn SVG icons in several stroke widths. Now Phosphor, from
  `src/components/icons.ts`.
- No pressed feedback, `transition: all`, hover only on some buttons. Fixed.

**States**
- Lists said "Loading…" in grey text. Now skeletons in the list's shape.
- Empty lists were a grey sentence. Now a framed empty state.
- Errors were grey text. Now the warning colour, with `role="alert"`.

**Accessibility (Web Interface Guidelines)**
- No visible keyboard focus on most controls; added one ring everywhere.
- Question labels weren't tied to their fields (any profile
  question). Fixed with `htmlFor` / `aria-labelledby`.
- Icon buttons without names; toggles without pressed state; a `div` acting
  as a button (the option picker). Fixed.
- Helper text at 2.5:1 contrast. `--text-300` and `--text-400` were darkened
  in the light theme to pass 4.5:1.
- No skip link, no `theme-color`, `100vh` on full-height areas, the page
  scrollbar hidden. Fixed.
- Reduced motion covered only the landing page. Now everything.

**Things that did nothing** (removed)
- "History: Today's Status / Custom Range" on the development page.
- "Export Memo" in the chat header.
- Footer links to `#`.

**Copy**
- Em-dashes in interface text were rewritten as two sentences or a colon.
  `...` became `…`.
- The hero's supporting line was shortened to 19 words. One new line was
  written: "Less to read. Nothing that matters missed."
- "Get Started Free" and "Get Started" became one label, "Get Started".
- "View Official Source Documentation" became "View Official Source";
  "Not relevant — dismiss" became "Dismiss".

**Found on the way**
- Opening a development from far down a list opened it scrolled down by the
  same amount. A page now opens at its top, and Back returns to the place in
  the list (`App.tsx`).

## Where the two add-ons disagree

- Headings and buttons: Vercel's rules say Title Case, the Taste skill says
  sentence case. Kept what the app already did: sentence-case headings,
  Title Case buttons.
- Em-dashes: the Taste skill bans them outright as a tell of generated copy.
  Applied to interface text only; analysis written by the model and stored
  data are untouched.

## Not done, and why

- **URL per screen** (bookmarks, new tab, browser Back): a routing change.
- **Virtualised long lists**: the lists are filtered by day and short.
- **Code splitting**: worth doing, separate from the redesign.
- **Colours**: the owner said to keep them. The violet and amber labels
  remain beside the blue accent.
- **Decorative imagery, grain, scroll effects** from the Taste skill's
  "upgrade techniques": wrong for a compliance tool at motion 3.

## Checking it

- `pnpm test:all`: type-checks, 416 unit tests, 116 browser tests
  (`tests/e2e/redesign.spec.ts` has the ten new ones).
- `CAPTURE=screens pnpm exec playwright test capture` writes every screen,
  light and dark, plus phone, to `test-results/screens/`.
- `CAPTURE=landing pnpm exec playwright test capture` regenerates the
  landing picture (`public/landing/company-{light,dark}.jpg`). Run it when
  the company page changes.
- Seen by eye in Chromium at 1440px and 390px, both themes: landing,
  sign-in, dashboard (each level), company page, development page (summary
  and impact cards, notes open), Profile (Account, Firm), chat, onboarding.
