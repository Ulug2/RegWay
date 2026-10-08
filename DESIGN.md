# RegWay design

How RegWay looks and behaves, for anyone (or any agent) changing the UI.
Read it before UI work. The values live in `src/index.css`; this file says
what they are for. Written in the format of the DESIGN.md files collected in
`VoltAgent/awesome-design-md`, after the redesign of 2026-10-08
(`prompts/redesign.md`).

## Overview

A working tool for compliance and deal people at a private equity firm.
They come to read what changed today and decide whether it matters. So:
calm, exact, quick to scan. Text does the work; decoration stays out of the
way. One accent colour, soft glass surfaces on a warm canvas, generous line
height in anything meant to be read.

Dials (the terms the Taste skill uses): variance 4, motion 3, density 5.

## Colors

The palette was set before the redesign and is not to be changed without
the owner's say. Every colour is a variable; components never hard-code
one. Both themes define the same names (`:root` and
`:root[data-theme='dark']`).

| Variable | Light | Dark | Use |
|---|---|---|---|
| `--canvas` | `#FDFBF7` | `#0B1220` | Page background |
| `--surface-rgb` | white | `#1E293B` | Cards and fields, always with an alpha |
| `--brand`, `--brand-light` | `#0284C7`, `#38BDF8` | same | Filled surfaces that carry white text (primary button, selected tab) |
| `--primary` | `#0284C7` | `#38BDF8` | Text, icons and links in the accent colour |
| `--text-900` | `#0F172A` | `#F1F5F9` | Headings, titles |
| `--text-600` | `#334155` | `#CBD5E1` | Body text |
| `--text-400`, `--text-300` | `#5A6B83`, `#6A788E` | `#94A3B8`, `#8493A8` | Helper text, dates. Both pass 4.5:1 on the canvas |
| `--placeholder` | `#94A3B8` | `#64748B` | Placeholder text only |
| `--line-rgb`, `--line-strong-rgb` | sky tints | slate-blue tints | Borders and rules, with an alpha |
| `--warning` | `#B45309` | `#FBBF24` | Errors, flags, stale answers |
| `--violet` | `#7C3AED` | `#A78BFA` | The "Geopolitical" label only |

Rules:
- One accent (sky blue). Amber means "needs attention"; violet names one
  category. Nothing else gets a colour.
- `--brand*` for fills under white text; `--primary*` for coloured text.
  They differ in dark mode on purpose.
- Shadows are tinted with the accent (`--shadow-card`, `--shadow-lift`,
  `--shadow-float`), never plain black on the light theme.

## Typography

- **Geist** for everything, **Geist Mono** for step numbers, key dates and
  code. Both are bundled (`@fontsource-variable/*`); nothing is fetched from
  a font service.
- Headings: weight 600, tight tracking (`-0.03em` to `-0.04em` at 28px and
  up), `text-wrap: balance`.
- Body: 15px/1.65 for anything read as prose (analysis, reasons), 14px for
  UI, 13px for helper text. Nothing below 12px. Paragraphs cap near 68
  characters.
- Numbers that line up or change (dates, counts) use `.num` (tabular
  figures).
- Labels inside cards are sentence case (`.section-label`), not small caps.
- Headings in sentence case; buttons in Title Case ("View Official Source").
- Use `…`, not `...`. No em-dashes in interface copy: write two sentences or
  use a colon.

## Layout

- Reading column: 672px (`max-w-2xl`) for lists; pages sit in a 1200px
  container (900px for Profile) with 20px side padding on a phone, 32px
  from `sm`.
- The page header is 64px, sticky, the same on every page: Back (when there
  is somewhere to go back to), the wordmark, the page's actions on the right
  (`PageHeader.tsx`).
- Pages are left-aligned. The landing hero is copy left, product picture
  right; the sign-in form takes the picture's place.
- Full-height areas use `100dvh`, never `100vh`.
- Every multi-column layout states its phone layout in the same component.

## Shapes

One rule, followed everywhere:

| Shape | Radius | For |
|---|---|---|
| Pill | full | Anything pressed: buttons, chips, tabs |
| Card | 16px (`--r-card`) | Cards and panels |
| Tile | 12px (`--r-tile`) | Blocks inside a card, initials tiles, notices |
| Field | 10px (`--r-field`) | Inputs, selects, text areas |
| Label | 6px | Static labels (`.badge`): category, status, "Needed" |
| Dialog | 24px (`--r-dialog`) | Sign-in panel, onboarding |

A label is square-cornered because it cannot be pressed; a chip is a pill
because it can.

## Components

All in `src/index.css`. Use these before writing new styles.

- **`.btn-primary`**: the one action a screen is for. At most one per view
  (confirmation rows aside). `.btn-lg`, `.btn-sm` for size.
- **`.btn-ghost`**: its alternative (Cancel, Sign In, Sign Out).
- **`.btn-tool`**: one of several actions in a row. Switched on with
  `aria-pressed="true"`, `aria-expanded="true"` or `.is-on`; `.is-accent`
  for the suggested one; `.is-warn` for a set flag.
- **`.btn-icon`**: a round button holding only an icon. Always has an
  `aria-label`.
- **`.link`**: inline text actions ("Edit profile", "Clear filters").
- **`.seg` / `.seg-item`**: tabs and view switches (Profile tabs, Summary /
  Impact Cards). `.level-tab` is the dashboard's three-level bar.
- **`.glass-card`, `.glass-card-light`**: cards. Use one only when the
  content is a separate object (a development, a profile, a panel). Group
  everything else with a rule or space.
- **`.glass-input-rect`, `.glass-input`, `.field-box`**: fields. Label
  above, helper and error below, label tied to the field with `htmlFor`.
- **`.badge`**, **`.notice`**, **`.tile`**, **`.empty-state`**,
  **`.skeleton`**: labels, information boxes, initials tiles, empty lists,
  loading shapes.
- **Icons**: Phosphor, imported from `src/components/icons.ts` only.
  Regular weight; bold for 16px and under in controls; fill for send/stop.
  Decorative icons carry `aria-hidden`.

Every list has four states: loading (skeleton in the list's shape), empty
(`.empty-state`, saying what would fill it), error (inline, with what to do
next), and filled.

## Motion

- Hover: colour and a 2px lift on cards. Press: `scale(0.98)`.
- 150 to 250ms, `--ease-out`. Transitions name their properties
  (`transition-ui`), never `all`.
- The landing page fades sections up once as they scroll in. Nothing loops
  except the "researching" dot and the chat's typing dots.
- `prefers-reduced-motion` turns all of it off.

## Accessibility

- One focus ring (2px accent, 2px offset) on every control, keyboard only.
- Every page starts with a "Skip to content" link.
- Buttons are `<button>`, links are `<a>`; nothing clickable is a `<div>`.
- Icon-only buttons have `aria-label`; toggles have `aria-pressed`;
  disclosures have `aria-expanded`.
- Messages that appear on their own (saved, errors) use `role="status"` or
  `role="alert"`.
- Text passes 4.5:1 in both themes.

## Do

- Reuse a class above before adding a style.
- Show the reason a development is listed ("Why it's here") more
  prominently than its official summary.
- Format dates for people ("Jan 1, 2027") and name sources in words
  ("Federal Register").
- Test both themes and a 390px screen (`CAPTURE=screens pnpm exec playwright
  test capture`).

## Don't

- Add a second accent colour, a gradient headline, or a glow.
- Ship a control that does nothing or a link to `#`.
- Put a card inside a card inside a card.
- Use small caps for labels, or text under 12px.
- Fake a product screenshot out of styled boxes. The landing picture is a
  real page, taken by `CAPTURE=landing pnpm exec playwright test capture`.
