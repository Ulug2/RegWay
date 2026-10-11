# Local database with the H.I.G. test firm

How every contributor gets the same tables as production, with a copy of
the H.I.G. Capital test firm inside, on their own machine. Two parts: the
owner makes the copy once; contributors load it with one command.

## What ends up on a contributor's machine

- **The tables**: built from `supabase/migrations/`, the same files that
  built production. Nothing is copied for this; the migrations are the
  database's structure.
- **The H.I.G. test firm**: its profile, funds, portfolio companies and
  holdings; the developments it is shown, with the reasons, the written
  analyses, flags and notes; and the source documents those point to.
- **A local sign-in**: `demo@regway.local` / `regway-demo-local`. It exists
  only in local databases.

What is **not** copied: anyone's real account or password, firm members,
chat conversations, AI usage records, other firms, and matches the matcher
rejected. Company logos are left out (they live in production storage).
No key of any kind is in the file.

Two things are changed on loading so the copy is usable: every match is
moved forward in time so the newest one reads as found a minute ago (the
dashboard opens on "today"), and every company is marked as just scanned
(otherwise the app would try an AI scan, which needs a key).

## Part 1: the owner makes the copy (once, and again when it goes stale)

You need `psql` (`brew install libpq`) and the production database's
connection string: Supabase dashboard → **Connect** → "Session pooler" →
copy the URI and put the database password into it.

```bash
SOURCE_DB_URL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres' \
  scripts/export-demo-firm.sh
```

- It only reads: the whole export is one read-only transaction.
- It writes `supabase/seeds/demo-firm.sql` and prints how many statements
  it wrote per table.
- It stops if the name does not match exactly one firm. The default is
  `H.I.G.%`; pass another pattern as the first argument.
- The connection string contains the database password. Type it on the
  command line as above; do not save it in a file in this repository.

Then **read the file before committing it**. It will be visible to everyone
with access to the repository. Check in particular the notes
(`regulation_notes`) and the firm's profile answers. When satisfied:

```bash
git checkout -b chore/demo-firm-data
git add supabase/seeds/demo-firm.sql
git commit -m "Local demo data: H.I.G. test firm as of <date>"
git push -u origin HEAD     # then open a pull request
```

Run it again whenever the copy has drifted from what you want the team to
see, or after a migration adds a column the app needs filled in.

## Part 2: contributors load it

Nothing extra. `supabase/config.toml` lists the file as a seed, so it is
loaded whenever a local database is built:

```bash
git pull                 # get the latest demo-firm.sql
supabase db reset        # rebuild the local database: migrations, then seeds
pnpm dev
```

(`supabase start` on a machine that has never had the database does the
same.) Open http://localhost:8443 and sign in as `demo@regway.local` with
the password `regway-demo-local`.

`supabase db reset` empties your local database first. Anything you added
by hand is gone; that is the point.

### Checking it worked

- The dashboard shows H.I.G.'s developments, funds and companies.
- At http://127.0.0.1:54323 (the local table browser), `firms` has one row.
- If the dashboard is empty: `ls supabase/seeds/demo-firm.sql`. If the file
  is not there, the owner has not committed it yet (Part 1).

### What works on the copy, and what does not

| Works | Needs an AI key (ask the owner) |
|---|---|
| Browsing the dashboard, fund, company and development pages | Matching new documents to the firm |
| Reading stored analyses | Writing or regenerating an analysis |
| Editing the profile, flags, notes, dismissals | Company scans |
| Sign-up of further local users | The chat |

Pressing something in the right-hand column without a key shows an error.
That is expected locally.

## Changing the database structure

The demo data is rows, not structure. To change a table, add a migration
(`CONTRIBUTING.md`, "Database changes") and run `supabase db reset`: your
new migration runs, then the demo firm loads on top. If the load fails
after your migration (for example a new required column with no default),
say so in the pull request: the owner re-runs Part 1 after merging.

## Why not give everyone the production database?

One mistaken query there changes what real users see, the keys that open it
also bypass every access rule, and each AI call costs money. A local copy
can be broken and rebuilt in a minute.
