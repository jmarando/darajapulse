GRANT SELECT ON public.contest_entries TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contest_entries TO authenticated;
GRANT ALL ON public.contest_entries TO service_role;
GRANT SELECT ON public.contest_winners TO anon;
GRANT SELECT ON public.influencers TO anon;
GRANT SELECT ON public.contest_excluded_handles TO anon;