# RegWay

Regulatory intelligence for private equity firms. React + Vite + Tailwind
CSS frontend; Supabase (Postgres, Auth, Edge Functions on Deno) backend;
Claude called only from Edge Functions. Instructions for AI coding agents
working in this repository. People start with `docs/onboarding.md`.

## Read first

- `docs/architecture.md`: how the frontend, database, functions and timers
  fit together.
- `CONTRIBUTING.md`: branches, pull requests, what needs the owner's review.
- `plans/regway-mvp-roadmap.md`: what is open. `docs/archive/roadmap-history.md`:
  what was built and how it was verified.
- `DESIGN.md`: how the UI looks. Read it before changing any screen.

## Rules

- Work on a branch and open a pull request. Never push to `main`.
- Never edit an existing file in `supabase/migrations/`; add the next
  numbered one.
- Never run `supabase link`, `supabase login`, `supabase db push` or
  `supabase functions deploy`, and never connect to the hosted Supabase
  project, unless the owner asks for it in this session. Development uses a
  local database (`supabase start`).
- Never write a key, password or token into a tracked file. The AI key
  lives only in `supabase/functions/.env` (ignored by git).
- No test may call a real Supabase project or the Anthropic API.
- A change that makes the AI run more often, or changes what it is asked,
  needs the owner's say-so: every call costs money.

## Commands

```bash
pnpm dev          # the app on http://localhost:8443 (PORT overrides)
pnpm test:all     # types, function types, unit tests, browser tests
pnpm build        # production build
supabase start    # local database: migrations, then seeds (demo firm)
supabase db reset # rebuild the local database
```

Do not run `pnpm format` across the repository: the code has not been
formatted with oxfmt as a whole.

## Project structure

Start with the task-relevant files below. Follow imports or inspect other
files only when needed.

- `src/main.tsx` - React entrypoint; imports `src/index.css` and mounts `src/App.tsx`
- `src/App.tsx` - Chooses the screen from the address (`src/lib/router.ts`)
- `src/components/` - Screens and UI parts; icons come from `src/components/icons.ts`
- `src/lib/data.ts` - Database queries; `src/lib/functions.ts` - Edge Function calls
- `src/lib/` - Pure logic, unit-tested in `tests/unit/`
- `src/index.css` - Tailwind CSS v4 import, colour variables, shared classes
- `supabase/migrations/` - Database structure and access rules, numbered
- `supabase/functions/` - Edge Functions; shared code in `_shared/`
- `tests/unit/` (Vitest), `tests/e2e/` (Playwright against `mockBackend.ts`)
- `vite.config.ts` - React and Tailwind plugins, the `@` alias for `src`
- `.mise.toml` - Node and pnpm versions

## Design

`DESIGN.md` at the repo root says how the UI looks and which shared classes
(`src/index.css`) and icons (`src/components/icons.ts`) to use. Read it
before changing any screen, and check both themes and a phone width.

## Dependencies

- Runtime: React 19 and React DOM 19; Phosphor icons; Geist fonts (bundled);
  `@supabase/supabase-js`
- Styling: Tailwind CSS v4 with the `@tailwindcss/vite` plugin
- Build and test: Vite 8, TypeScript 5.7, Vitest, Playwright, Deno (function
  type checks)
- Adding a dependency needs the owner's review.

## Styling

Tailwind CSS v4 through the `@tailwindcss/vite` plugin configured in
`vite.config.ts`. `src/index.css` imports Tailwind with
`@import 'tailwindcss';`. Use Tailwind utility classes directly in JSX and
put global CSS or theme customization in `src/index.css`. There is no
Tailwind config file or PostCSS config.

`src/main.tsx` imports `src/index.css`, so global font wiring belongs in
`src/index.css`. Keep CSS `@import` statements first, then any `@font-face`
rules and font-family defaults.
