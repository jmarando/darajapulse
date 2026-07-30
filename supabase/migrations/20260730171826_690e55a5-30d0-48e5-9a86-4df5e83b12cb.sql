CREATE INDEX IF NOT EXISTS post_metrics_post_id_idx ON public.post_metrics (post_id);
CREATE INDEX IF NOT EXISTS posts_campaign_id_idx ON public.posts (campaign_id);

CREATE OR REPLACE FUNCTION public.campaign_perf_summary(campaign_ids uuid[])
RETURNS TABLE(campaign_id uuid, posts bigint, views numeric, engagement numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH allowed AS (
    SELECT c.id
      FROM public.campaigns c
     WHERE c.id = ANY(campaign_ids)
       AND (
         public.agency_staff_on_campaign(auth.uid(), c.id)
         OR public.user_has_campaign_access(auth.uid(), c.id)
       )
  ),
  peak AS (
    SELECT p.id AS post_id,
           p.campaign_id,
           COALESCE(m.views, 0) AS views,
           COALESCE(m.likes, 0) + COALESCE(m.comments, 0)
             + COALESCE(m.shares, 0) + COALESCE(m.saves, 0) AS eng
      FROM public.posts p
      JOIN allowed a ON a.id = p.campaign_id
      LEFT JOIN LATERAL (
        SELECT MAX(pm.views) AS views, MAX(pm.likes) AS likes,
               MAX(pm.comments) AS comments, MAX(pm.shares) AS shares,
               MAX(pm.saves) AS saves
          FROM public.post_metrics pm
         WHERE pm.post_id = p.id
      ) m ON true
  )
  SELECT campaign_id,
         COUNT(*)::bigint,
         SUM(views)::numeric,
         SUM(eng)::numeric
    FROM peak
   GROUP BY campaign_id;
$function$;