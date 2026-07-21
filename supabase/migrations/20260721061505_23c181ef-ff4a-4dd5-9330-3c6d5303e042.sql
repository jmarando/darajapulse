DROP POLICY IF EXISTS "Public reads active contests" ON public.contests;
CREATE POLICY "Public reads contests with submission token"
ON public.contests
FOR SELECT
TO anon
USING (submission_token IS NOT NULL);