
DROP POLICY IF EXISTS "Public reads approved entries of active contests" ON public.contest_entries;
CREATE POLICY "Public reads entries of active contests"
ON public.contest_entries FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.contests c
    WHERE c.id = contest_entries.contest_id AND c.is_active = true
  )
);

DROP POLICY IF EXISTS "Public reads approved entries via report link" ON public.contest_entries;
CREATE POLICY "Public reads entries via report link"
ON public.contest_entries FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.contests c
    JOIN public.report_links rl ON rl.campaign_id = c.campaign_id
    WHERE c.id = contest_entries.contest_id AND rl.is_active
  )
);
