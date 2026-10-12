# Fund / company pages + day-by-day lists

Roadmap item 9, and a request made with it.

## Prompt

> Yes do item 9. Btw, when we are listing regulations or enforcements, we
> are listing them all under that company or fund or firm. We don't have no
> dates. Whenever we click on something, it should be showing stuff that AI
> found today. Then our date button can switch from today to yesterday or
> day before and go on till the first day user used the app. So it should
> show today's findings.

## Audit

| Piece | State |
|---|---|
| Lists | `EntityFeed`: every match for the entity at once, filters by category / search / publish date window / location. No notion of when RegWay found an item, though `matched_at` (`regulation_relevance.created_at`) is loaded. |
| Funds / companies | Expand inside the dashboard under the Fund Structure / Portfolio Companies tabs (`ui:selectedFund` / `ui:selectedCompany`). |
| Navigation | No router; `App.tsx` view state. Detail and Profile always go back to the dashboard. |
| First use | `firms.created_at` exists (not on the `Firm` type). |

## Decisions

- "Found" = matched to the entity, in the viewer's local day. Publication
  date stays visible on each card and as its own filter.
- Opening a page (or the PE Firm tab) shows today; the chosen day is kept in
  the memory-only `ui:` cache so opening a development and coming back
  doesn't lose it.
- Empty day: say so, link to the most recent day with findings, and "Show
  all days" (search over everything still possible).
- Furthest back: the firm's sign-up day, or an earlier finding.
