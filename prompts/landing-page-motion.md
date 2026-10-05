# Landing page: sign-in in place + scroll animations (roadmap item 10)

## Prompt

> Do the next item then

## Audit

| Piece | State |
|---|---|
| Landing | `LandingPage.tsx`: hero, three feature cards, footer. Buttons switch `App` to the `auth` view. |
| Auth | `AuthScreen.tsx`: full-screen card (sign-in / sign-up / forgot, password rules, notice after a password change). |
| Motion | None; no animation library installed. |

## Decisions

- No library: CSS transitions + IntersectionObserver are enough for
  slide-ins and keep the bundle unchanged.
- The `auth` view stays (the password-changed notice sends users there) but
  renders the landing page with the form open, so every entry point gets
  the in-place form.
- Desktop: the hero column's max-width shrinks while the form column's
  width grows from 0 (its content laid out at full width, so it slides out
  rather than squeezing). Mobile: the form opens below and is scrolled into
  view.
- Reduced motion: transitions and transforms off, content visible.
- Copy brought up to date with what the product now does; no claims beyond it.
