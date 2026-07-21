CREATE OR REPLACE FUNCTION public.get_contest_by_token(_token text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'hashtag', c.hashtag,
    'platforms', c.platforms,
    'start_date', c.start_date,
    'end_date', c.end_date,
    'prize', c.prize,
    'is_active', c.is_active,
    'campaign', CASE WHEN cm.id IS NOT NULL
      THEN jsonb_build_object('id', cm.id, 'name', cm.name)
      ELSE NULL END,
    'client', jsonb_build_object(
      'name', cl.name,
      'logo_url', cl.logo_url
    )
  )
  FROM public.contests c
  LEFT JOIN public.campaigns cm ON cm.id = c.campaign_id
  LEFT JOIN public.clients cl ON cl.id = COALESCE(c.client_id, cm.client_id)
  WHERE c.submission_token = _token
  LIMIT 1;
$function$;