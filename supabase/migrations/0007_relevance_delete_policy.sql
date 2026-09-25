-- Lets a member clear their own firm's relevance links. Needed when a
-- portfolio company's location/sector is edited: its cached
-- company-regulations scan results were computed from the old values and
-- must be dropped so the next click re-scans.

create policy "members delete own relevance links" on regulation_relevance
  for delete using (firm_id = auth_firm_id());
