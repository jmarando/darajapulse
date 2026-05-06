CREATE OR REPLACE FUNCTION public.get_brief_by_token(_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'influencer', jsonb_build_object('id', i.id, 'full_name', i.full_name, 'handle', i.handle)
  )
  FROM public.campaign_influencers ci
  JOIN public.campaigns c ON c.id = ci.campaign_id
  JOIN public.clients cl ON cl.id = c.client_id
  JOIN public.influencers i ON i.id = ci.influencer_id
  WHERE ci.brief_token = _token
  LIMIT 1;
$function$;