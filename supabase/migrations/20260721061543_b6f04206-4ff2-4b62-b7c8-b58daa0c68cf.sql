DROP POLICY IF EXISTS "Public reads contest_excluded_handles for active contests" ON public.contest_excluded_handles;
CREATE POLICY "Public reads contest_excluded_handles via submission token"
ON public.contest_excluded_handles
FOR SELECT
TO anon
USING (EXISTS (SELECT 1 FROM public.contests c WHERE c.id = contest_excluded_handles.contest_id AND c.submission_token IS NOT NULL));

CREATE POLICY "Public reads influencer handles for filtering"
ON public.influencers
FOR SELECT
TO anon
USING (true);