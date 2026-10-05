# Implement: Profile screen

You're working in the RegWay repo (`/Users/ulykbekkhairulla/dev/regpe`). Use
the findings from `prompts/15-profile-screen-investigate.md`: confirmed no
UPDATE policy exists on `firms`, `data.ts` follows a
`getUser()`-then-`supabase.from()` pattern, and email changes need a
"check your email" confirmation UX matching `AuthScreen.tsx`'s existing
pattern.

## Database

1. New migration `supabase/migrations/0006_firms_update_policy.sql`:
   `create policy "members update own firm" on firms for update using (id
   = auth_firm_id()) with check (id = auth_firm_id());` — reuses the
   existing `auth_firm_id()` function from `0001_init.sql`.

## `src/lib/data.ts`

2. Add `updateFirm(firmId: string, updates: Partial<Pick<Firm, 'name' |
   'hq_location' | 'lead_gp_name' | 'jurisdictions'>>): Promise<void>` —
   general-purpose (Settings screen will reuse it later), following the
   existing `supabase.from('firms').update(updates).eq('id',
   firmId)`-then-throw-on-error style already used elsewhere in the file.

## `src/components/ProfileScreen.tsx` (new)

3. Same header pattern as `HeadlineDetailView.tsx` (sticky `glass-nav`,
   "Back to Dashboard" button, logo, avatar) and same glass-card/
   glass-input-rect/btn-primary/btn-ghost styling as the rest of the app —
   match tone exactly, no new visual language.
4. On mount: fetch the firm (via `getFirmId()` then `supabase.from('firms')
   .select('*').eq('id', id).single()`, same pattern `Dashboard.tsx` and
   `HarveyAICopilot.tsx` already use) and the current user's email (
   `supabase.auth.getUser()`).
5. Three independent sections, each with its own save action (don't couple
   them into one giant form — matches this app's existing pattern of small,
   independent actions rather than one big submit):
   - **Your name** — editable text field bound to `firm.lead_gp_name`,
     saved via the new `updateFirm()`.
   - **Email** — editable field bound to the current email, saved via
     `supabase.auth.updateUser({ email })`. On success, show a "check your
     email to confirm" message (reuse the same visual pattern
     `AuthScreen.tsx` uses for its post-signup confirmation state) rather
     than assuming the change applied immediately.
   - **Password** — new password + confirm fields (client-side match
     check), saved via `supabase.auth.updateUser({ password })`. Applies
     immediately; show a plain success message.
6. **Sign out** button at the bottom — `supabase.auth.signOut()`. No
   special handling needed beyond the call itself; `App.tsx`'s existing
   `onAuthStateChange` listener already routes a signed-out session to
   `'landing'`.
7. Each section manages its own `loading`/`error`/`success` local state,
   consistent with how `AuthScreen.tsx` and `OnboardingModal.tsx` already
   handle async form actions.

## Wiring

8. `src/App.tsx`: add `'profile'` to the `View` type, render
   `<ProfileScreen onBack={() => setView('dashboard')} />` for that view
   (same pattern as `'landing'` was just added).
9. `src/components/Dashboard.tsx`: add `'profile'` to the local `View`
   type; change the avatar button's `onClick` from
   `supabase.auth.signOut()` to `onNavigate('profile')`; remove the now-
   inaccurate `title="Sign out"` tooltip (or change it to something like
   `"Profile"`). Leave the Settings pill button untouched — that's a
   separate future task.

## Verify

- `pnpm exec tsc --noEmit`.
- `supabase db push` for the new migration.
- Live in the browser: click the Dashboard avatar → lands on Profile, not
  signed out. Change the display name, confirm it persists (reload,
  re-check Dashboard's greeting reflects the new name). Change the
  password to a new value, then actually sign out and sign back in with
  the *new* password to prove the change really took effect, not just that
  the call returned success. Confirm the email-change flow shows the
  "check your email" state rather than silently pretending it's done.
  Click sign out from Profile and confirm it lands on the landing page.
