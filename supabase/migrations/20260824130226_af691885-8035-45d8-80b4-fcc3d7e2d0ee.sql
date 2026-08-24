CREATE OR REPLACE FUNCTION public.get_contest_winners_by_token(_token text)
RETURNS TABLE(
  id uuid, contest_id uuid, entry_id uuid, round_number integer, placement_rank integer,
  placement text, prize text, full_name text, handle text, platform text,
  post_url text, thumbnail_url text, frozen_score numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id, w.contest_id, w.entry_id, w.round_number, w.placement_rank,
         w.placement, w.prize, w.full_name, w.handle, w.platform,
         w.post_url, w.thumbnail_url, w.frozen_score
  FROM public.contest_winners w
  JOIN public.contests c ON c.id = w.contest_id
  WHERE c.submission_token = _token
  ORDER BY w.round_number, w.placement_rank
$$;

GRANT EXECUTE ON FUNCTION public.get_contest_winners_by_token(text) TO anon, authenticated;