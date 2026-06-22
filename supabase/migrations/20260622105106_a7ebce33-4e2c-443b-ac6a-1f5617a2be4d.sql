
CREATE OR REPLACE FUNCTION public.campaign_perf_summary(campaign_ids uuid[])
RETURNS TABLE (campaign_id uuid, posts bigint, views numeric, engagement numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH peak AS (
    SELECT p.id AS post_id,
           p.campaign_id,
           COALESCE(MAX(pm.views), 0) AS views,
           COALESCE(MAX(pm.likes), 0) AS likes,
           COALESCE(MAX(pm.comments), 0) AS comments,
           COALESCE(MAX(pm.shares), 0) AS shares,
           COALESCE(MAX(pm.saves), 0) AS saves
      FROM posts p
      LEFT JOIN post_metrics pm ON pm.post_id = p.id
     WHERE p.campaign_id = ANY(campaign_ids)
     GROUP BY p.id, p.campaign_id
  )
  SELECT campaign_id,
         COUNT(*)::bigint AS posts,
         SUM(views)::numeric AS views,
         SUM(likes + comments + shares + saves)::numeric AS engagement
    FROM peak
   GROUP BY campaign_id;
$$;

GRANT EXECUTE ON FUNCTION public.campaign_perf_summary(uuid[]) TO authenticated, anon, service_role;
