# 16b: three tasks the owner decided on 2026-10-08

## 16b.2 AI work waits five minutes after the last profile edit

- **Before**: every save that changed a fact at once rewrote the analyses
  of what the entity is matched to and re-judged recent rejections. Three
  quick edits paid three times (one edit on H.I.G. cost $0.83).
- **Now**: a save inserts a row in `profile_changes` (migration 0035)
  saying what it calls for: rewrite analyses, re-check regulatory and
  enforcement items, re-check geopolitical items. Nothing else happens at
  the save. `apply-profile-changes` (cron, every minute, service key)
  takes each firm whose latest row is at least five minutes old and does
  everything its rows ask for in one round: one call per matcher, one
  analysis refresh per edited entity however many times it was saved. A
  newer edit restarts the wait for everything pending.
- Rows are claimed by deleting them, so a run that starts while another is
  still working pays for nothing. A re-check that filled a batch leaves a
  continuation row (no forgetting again) for the next minute; a failed
  round puts the rows back, at most six times.
- Members can only insert rows for their own firm, and only the columns
  that say what changed: `changed_at` is always the server's now, so the
  wait can't be skipped from the browser.
- **Company scans** (client-driven, `src/lib/scans.ts`): an edit that
  changes a company's location, industry or footprint marks it for a new
  scan; the scan waits until the profile has been quiet five minutes, and
  the old results are replaced when it starts, not at the save. A company
  just added is still scanned at once.
- The Profile card says "Matches and analyses update a few minutes after
  your last change."
- **Live**: three test rows for H.I.G. (two for one entity, the third
  three minutes newer) sat untouched until the newest was five minutes
  old, then went in one run: "1 firms, 2 calls", $0 (the entities had
  nothing matched). Not watched live: a real edit that re-judges items.
- Not changed: onboarding still runs the matchers at once; recording a
  holding still re-derives fund matches at once (no AI call).

## 16b.1 The official document replaces its announcement as the card

- The pointer in the database is unchanged (document → announcement,
  since one announcement can cover several documents). What changed is
  which one a list shows (`src/lib/duplicates.ts`): once a Federal
  Register document announced by an SEC / FTC / CFPB release is in the
  list, it is the card and the announcement is its link. An announcement
  of two rules becomes two cards. Until a document is matched, or where
  none is, the announcement stays the card and links to the documents.
- The document's analysis is written from the official text: analyses are
  no longer skipped for a document whose announcement the firm already
  sees (`withoutCoveredDuplicates`).
- Dismissing a document dismisses that rule only; the announcement stays
  hidden behind it and the other rule from the same release stays. A
  document that arrives after its announcement was dismissed stays hidden.
- RegWay AI's context names the document, with the announcement on its
  line.
- **Live on H.I.G.**: the firm page now shows "Adviser and Regulated Fund
  Custody Rules; Crypto Custody Rules" and "Investment Adviser
  Performance-Based Compensation Modernization" as cards, each linking to
  its SEC announcement.
- Left open: notes and flags made on the announcement stay with the
  announcement, which is no longer shown once its document is; a document
  from a package that the matcher judged not relevant (the interval-fund
  rule on H.I.G.) is no longer linked from anywhere on the page.

## 16b.3 Dark mode

- Every colour is now a variable in `src/index.css` (`:root` for light,
  `:root[data-theme='dark']` for dark). About 540 inline colours in 33
  component files were moved onto them by a script; light looks as before.
  `--brand*` (filled buttons and avatars with white text) is the same in
  both themes; `--primary*` (text, links, icons) is lighter on dark.
- `src/lib/theme.ts`: follows the device by default, live. Profile →
  Account → Appearance offers Match device / Light / Dark; the choice is
  kept in this browser (localStorage), not in the account. `index.html`
  sets the theme before anything paints, so a dark page doesn't flash
  light.
- Checked by screenshot in dark: landing, dashboard, a development's page,
  Settings, Account, the chat. Not looked at in dark: the onboarding
  wizard, the password-reset screen, the fund and company pages, the
  dismissed list (they use the same variables).
- Left open: the theme choice does not follow the user to another
  browser; the logo image is the same in both themes; emails are not
  themed (none are sent yet).
