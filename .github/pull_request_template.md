## What this changes

<!-- One or two sentences. Link the issue: "Closes #12". -->

## How I checked it

<!-- What you ran and what you looked at. For a screen change, add a
     screenshot in light and dark, and one at phone width. -->

## Checklist

- [ ] `pnpm test:all` passes on my machine
- [ ] The change is one thing, and small enough to review in one sitting
- [ ] New behaviour has a test, or I say above why it does not
- [ ] No keys, passwords, tokens or `.env` files in the diff
- [ ] Screen changes follow `DESIGN.md` (both themes, phone width)

## Needs the owner's review

<!-- Tick any that apply. These cannot merge without @Ulug2's approval. -->

- [ ] Adds a database migration (a new file; existing migrations are never edited)
- [ ] Touches sign-in, access rules (RLS) or anything under `supabase/`
- [ ] Changes what is sent to the AI, or how often (it costs money per call)
- [ ] Adds or upgrades a dependency
- [ ] None of the above
