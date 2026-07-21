DROP POLICY IF EXISTS "Public reads approved entries of active contests" ON public.contest_entries;
CREATE POLICY "Public reads entries via contest submission token"
ON public.contest_entries
FOR SELECT
TO anon
USING (EXISTS (SELECT 1 FROM public.contests c WHERE c.id = contest_entries.contest_id AND c.submission_token IS NOT NULL));