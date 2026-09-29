-- Records when a portfolio company's AI web-search scan last completed, so the
-- app can tell "never scanned / stale" apart from "scanned and found nothing"
-- and pre-warm scans in the background instead of on the user's first click.

alter table portfolio_companies add column last_scanned_at timestamptz;

-- Companies that already have scan results count as scanned at their newest result.
update portfolio_companies c
set last_scanned_at = r.latest
from (
  select portfolio_company_id, max(created_at) as latest
  from regulation_relevance
  where portfolio_company_id is not null
  group by portfolio_company_id
) r
where r.portfolio_company_id = c.id;
