CREATE OR REPLACE FUNCTION public.campaign_post_peak_metrics(target_campaign_id uuid)
RETURNS TABLE(
  post_id uuid,
  captured_at timestamptz,
  views numeric,
  likes numeric,
  comments numeric,
  shares numeric,
  saves numeric,
  reach numeric,
  impressions numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT
    p.id AS post_id,
    MAX(pm.captured_at) FILTER (WHERE pm.id IS NOT NULL) AS captured_at,
    COALESCE(MAX(pm.views), 0)::numeric AS views,
    COALESCE(MAX(pm.likes), 0)::numeric AS likes,
    COALESCE(MAX(pm.comments), 0)::numeric AS comments,
    COALESCE(MAX(pm.shares), 0)::numeric AS shares,
    COALESCE(MAX(pm.saves), 0)::numeric AS saves,
    COALESCE(MAX(pm.reach), 0)::numeric AS reach,
    COALESCE(MAX(pm.impressions), 0)::numeric AS impressions
  FROM public.posts p
  LEFT JOIN public.post_metrics pm ON pm.post_id = p.id
  WHERE p.campaign_id = target_campaign_id
  GROUP BY p.id
$function$;

GRANT EXECUTE ON FUNCTION public.campaign_post_peak_metrics(uuid) TO anon, authenticated, service_role;