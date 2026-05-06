
-- 1. Add brief_token to campaign_influencers
ALTER TABLE public.campaign_influencers
  ADD COLUMN IF NOT EXISTS brief_token text UNIQUE DEFAULT encode(extensions.gen_random_bytes(16), 'hex');

UPDATE public.campaign_influencers
SET brief_token = encode(extensions.gen_random_bytes(16), 'hex')
WHERE brief_token IS NULL;

ALTER TABLE public.campaign_influencers
  ALTER COLUMN brief_token SET NOT NULL;

-- 2. Public function: fetch brief by token
CREATE OR REPLACE FUNCTION public.get_brief_by_token(_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ci_id', ci.id,
    'status', ci.status,
    'fee_kes', ci.fee_kes,
    'deliverables_count', ci.deliverables_count,
    'campaign', jsonb_build_object(
      'name', c.name,
      'brief', c.brief,
      'objective', c.objective,
      'hashtag', c.hashtag,
      'start_date', c.start_date,
      'end_date', c.end_date
    ),
    'client', jsonb_build_object('name', cl.name),
    'influencer', jsonb_build_object('full_name', i.full_name, 'handle', i.handle)
  )
  FROM public.campaign_influencers ci
  JOIN public.campaigns c ON c.id = ci.campaign_id
  JOIN public.clients cl ON cl.id = c.client_id
  JOIN public.influencers i ON i.id = ci.influencer_id
  WHERE ci.brief_token = _token
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_brief_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_brief_by_token(text) TO anon, authenticated;

-- 3. Public function: creator updates their status via token
CREATE OR REPLACE FUNCTION public.update_brief_status(_token text, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _status NOT IN ('confirmed', 'declined', 'negotiating') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  UPDATE public.campaign_influencers
  SET status = _status
  WHERE brief_token = _token;
END;
$$;

REVOKE ALL ON FUNCTION public.update_brief_status(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_brief_status(text, text) TO anon, authenticated;
