
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS dos text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS donts text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mandatory_mentions text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS hashtags_extra text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS content_format text,
  ADD COLUMN IF NOT EXISTS tone text,
  ADD COLUMN IF NOT EXISTS references_urls text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS wht_percent numeric DEFAULT 5;

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
      'end_date', c.end_date,
      'dos', c.dos,
      'donts', c.donts,
      'mandatory_mentions', c.mandatory_mentions,
      'hashtags_extra', c.hashtags_extra,
      'content_format', c.content_format,
      'tone', c.tone,
      'references_urls', c.references_urls,
      'wht_percent', c.wht_percent
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
