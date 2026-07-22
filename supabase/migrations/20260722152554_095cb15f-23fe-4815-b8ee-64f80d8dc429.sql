CREATE OR REPLACE FUNCTION public.get_public_storefront(_agency_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'agency', jsonb_build_object(
      'id', a.id, 'name', a.name, 'slug', a.slug,
      'display_name', a.display_name, 'logo_url', a.logo_url,
      'primary_color', a.primary_color, 'support_email', a.support_email
    ),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'kind', i.kind, 'title', i.title, 'subtitle', i.subtitle,
        'description', i.description, 'platform', i.platform, 'handle', i.handle,
        'cover_url', i.cover_url, 'follower_count', i.follower_count,
        'engagement_rate', i.engagement_rate, 'audience_demo', i.audience_demo,
        'demo_source', i.demo_source,
        'deliverable_type', i.deliverable_type, 'turnaround_days', i.turnaround_days,
        'revisions', i.revisions, 'tags', i.tags
      ) ORDER BY i.sort_order, i.title)
      FROM public.inventory_items i
      WHERE i.agency_id = a.id AND i.is_active
    ), '[]'::jsonb)
  )
  FROM public.agencies a
  WHERE lower(a.slug) = lower(_agency_slug) AND a.is_active
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_storefront(text) TO anon, authenticated;