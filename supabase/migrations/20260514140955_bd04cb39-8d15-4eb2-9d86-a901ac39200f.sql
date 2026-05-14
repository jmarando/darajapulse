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
    'deliverables_breakdown', ci.deliverables_breakdown,
    'campaign', jsonb_build_object(
      'name', c.name,
      'brief', COALESCE(t.brief, c.brief),
      'objective', COALESCE(t.objective, c.objective),
      'hashtag', COALESCE(t.hashtag, c.hashtag),
      'start_date', c.start_date,
      'end_date', c.end_date,
      'dos', COALESCE(t.dos, c.dos),
      'donts', COALESCE(t.donts, c.donts),
      'mandatory_mentions', COALESCE(t.mandatory_mentions, c.mandatory_mentions),
      'hashtags_extra', COALESCE(t.hashtags_extra, c.hashtags_extra),
      'content_format', COALESCE(t.content_format, c.content_format),
      'tone', COALESCE(t.tone, c.tone),
      'references_urls', COALESCE(t.references_urls, c.references_urls),
      'wht_percent', COALESCE(t.wht_percent, c.wht_percent)
    ),
    'client', jsonb_build_object('name', cl.name),
    'influencer', jsonb_build_object('id', i.id, 'full_name', i.full_name, 'handle', i.handle, 'primary_platform', i.primary_platform)
  )
  FROM public.campaign_influencers ci
  JOIN public.campaigns c ON c.id = ci.campaign_id
  LEFT JOIN public.brief_templates t ON t.id = c.brief_template_id
  JOIN public.clients cl ON cl.id = c.client_id
  JOIN public.influencers i ON i.id = ci.influencer_id
  WHERE ci.brief_token = _token
  LIMIT 1;
$function$;