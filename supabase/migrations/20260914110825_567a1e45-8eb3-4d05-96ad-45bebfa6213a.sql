CREATE INDEX IF NOT EXISTS idx_post_metrics_captured_at ON public.post_metrics (captured_at);

CREATE OR REPLACE FUNCTION public.dashboard_overview(_from date, _to date)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
WITH allowed AS (
  SELECT c.id, c.status
    FROM public.campaigns c
   WHERE public.agency_staff_on_campaign(auth.uid(), c.id)
      OR public.user_has_campaign_access(auth.uid(), c.id)
),
peak AS (
  SELECT p.id AS post_id, p.campaign_id, p.influencer_id, p.caption,
         COALESCE(m.views,0) AS views, COALESCE(m.likes,0) AS likes,
         COALESCE(m.comments,0) AS comments, COALESCE(m.shares,0) AS shares,
         COALESCE(m.reach,0) AS reach
    FROM public.posts p
    JOIN allowed a ON a.id = p.campaign_id
    LEFT JOIN LATERAL (
      SELECT MAX(pm.views) views, MAX(pm.likes) likes, MAX(pm.comments) comments,
             MAX(pm.shares) shares, MAX(pm.reach) reach
        FROM public.post_metrics pm WHERE pm.post_id = p.id
    ) m ON true
),
series AS (
  SELECT to_char(pm.captured_at, 'MM-DD') AS d,
         MAX(COALESCE(pm.likes,0) + COALESCE(pm.comments,0) + COALESCE(pm.shares,0)) AS v
    FROM public.post_metrics pm
    JOIN peak k ON k.post_id = pm.post_id
   WHERE pm.captured_at >= _from::timestamptz
     AND pm.captured_at < (_to + 1)::timestamptz
   GROUP BY 1
),
top_post AS (
  SELECT k.post_id, k.caption, k.views, k.likes, c.name AS campaign_name,
         i.handle, i.full_name
    FROM peak k
    LEFT JOIN public.campaigns c ON c.id = k.campaign_id
    LEFT JOIN public.influencers i ON i.id = k.influencer_id
   WHERE k.views > 0
   ORDER BY k.views DESC LIMIT 1
),
top_camp AS (
  SELECT k.campaign_id AS id, c.name, SUM(k.views) AS views
    FROM peak k JOIN public.campaigns c ON c.id = k.campaign_id
   GROUP BY 1,2 ORDER BY 3 DESC LIMIT 1
)
SELECT jsonb_build_object(
  'clients', (SELECT COUNT(*) FROM public.clients),
  'campaigns', (SELECT COUNT(*) FROM allowed),
  'live', (SELECT COUNT(*) FROM allowed WHERE status = 'live'),
  'influencers', (SELECT COUNT(*) FROM public.influencers),
  'posts', (SELECT COUNT(*) FROM peak),
  'briefs', (SELECT COUNT(*) FROM public.content_items),
  'contests', (SELECT COUNT(*) FROM public.contests),
  'totals', (SELECT jsonb_build_object(
      'views', COALESCE(SUM(views),0), 'likes', COALESCE(SUM(likes),0),
      'comments', COALESCE(SUM(comments),0), 'shares', COALESCE(SUM(shares),0),
      'reach', COALESCE(SUM(reach),0)) FROM peak),
  'series', COALESCE((SELECT jsonb_agg(jsonb_build_object('d', d, 'v', v) ORDER BY d) FROM series), '[]'::jsonb),
  'top_post', (SELECT to_jsonb(t) FROM top_post t),
  'top_campaign', (SELECT to_jsonb(t) FROM top_camp t),
  'recent', COALESCE((SELECT jsonb_agg(r) FROM (
      SELECT c.id, c.name, c.status, c.hashtag, c.budget_kes,
             jsonb_build_object('name', cl.name) AS clients
        FROM public.campaigns c
        JOIN allowed a ON a.id = c.id
        LEFT JOIN public.clients cl ON cl.id = c.client_id
       ORDER BY c.created_at DESC LIMIT 5) r), '[]'::jsonb)
);
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_overview(date, date) TO authenticated;