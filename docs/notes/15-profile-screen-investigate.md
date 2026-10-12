# Investigate: Profile screen

You're working in the RegWay repo (`/Users/ulykbekkhairulla/dev/regpe`). This
is a **read-only investigation pass** — do not edit anything yet.

Context: `plans/regway-mvp-roadmap.md`, "New screens." Profile = personal
(name, email, password, sign out) — distinct from the future Settings
screen (firm/workspace). Currently `Dashboard.tsx`'s avatar button signs
the user out directly on a single click (a footgun for a destructive-ish
action) — it should navigate to a Profile screen instead.

Already confirmed this session, verify these still hold:
- `Dashboard.tsx` (~line 166-173): avatar button `onClick={() =>
  supabase.auth.signOut()}`. Local `View` type (~line 7) doesn't include
  `'profile'` yet. The "Settings" pill button next to it has no `onClick`
  at all (dead button) — that's a separate future task (Settings screen),
  don't wire it up as part of this one.
- `firms` table (`supabase/migrations/0001_init.sql`) has a `lead_gp_name`
  column — that's where the "name" shown in Profile comes from (there's no
  separate per-user profile table).
- **Real gap found**: `firms` only has SELECT (`members read own firm`)
  and INSERT (`authenticated users can create a firm`,
  `0002_onboarding_insert_policies.sql`) RLS policies — **no UPDATE
  policy exists**. Updating `lead_gp_name` from the client will fail
  silently/error today without a new migration adding one.

## Steps

1. Confirm the RLS gap precisely: check `pg_policies` for the `firms`
   table via psql (same connection pattern as before) to verify no UPDATE
   policy currently exists, so the migration this unblocks is scoped
   correctly (`for update using (id = auth_firm_id()) with check (id =
   auth_firm_id())`, matching the existing `auth_firm_id()` helper
   function already used by other policies).
2. Read `src/lib/data.ts` in full and confirm the existing
   `getFirmId()`/`setFlagged()`/`addNote()` patterns (auth check via
   `supabase.auth.getUser()`, direct `supabase.from(...)` calls) so a new
   `updateFirm()` helper matches the established style. Note this helper
   will also be needed later by the Settings screen — write it generally
   (accept a partial update object) rather than name-specific.
3. Confirm `supabase.auth.updateUser()`'s real behavior for this project:
   password changes apply immediately; email changes send a confirmation
   link to the *new* address and don't take effect until clicked (same
   "check your email" pattern `AuthScreen.tsx` already handles for
   sign-up — reuse that UX pattern rather than inventing a new one).
4. Read `HeadlineDetailView.tsx`'s header (sticky nav with a "Back to
   Dashboard" button) and `Dashboard.tsx`'s greeting/initials logic
   (`firm?.lead_gp_name?.split(' ')[0]`) to match the established header
   pattern and initials-avatar style exactly.
5. Confirm how `App.tsx` wires new views (`'profile'` needs to be added to
   its `View` type and rendered, same pattern as `'landing'` was just
   added) and how navigation should flow: Dashboard avatar → `'profile'`;
   Profile needs a way back to Dashboard, and its own sign-out action
   (calling `supabase.auth.signOut()`, which `App.tsx`'s existing
   `onAuthStateChange` listener already routes to `'landing'` — no new
   handling needed there).

## Output

Confirmed RLS gap + exact policy SQL needed, confirmed `data.ts` patterns
to match, confirmed email-change UX behavior, and a concrete component plan
(fields, layout, navigation wiring) ready to implement.
