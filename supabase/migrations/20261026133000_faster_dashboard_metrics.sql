-- Dashboard numbers from a small per-post summary instead of 363k raw snapshots.
--
-- Why: dashboard_overview() and campaign_perf_summary() worked out every post's peak
-- (the MAX of each metric) from post_metrics on every call. That table holds about
-- 363k rows (62 MB with indexes) and grows with every refresh. In production the
-- Overview averaged 3.1 s per call (worst 6.6 s over 180 calls) and the Campaigns
-- list 1.9 s (261 calls); how long a call takes depends on how busy the database is
-- and how much of the table happens to be cached. Rewriting the query as one grouped
-- pass was not a clear win: faster for the large agency, slower for the small one.
--
-- What: post_metric_peaks keeps one row per post with the peak of each metric.
-- Triggers on post_metrics keep it exact: an insert takes the greater value, an
-- update or delete rebuilds the posts it touched (agency staff can edit and delete
-- snapshots from the app, and a corrected snapshot must lower the peak again). The
-- two functions read the summary instead of post_metrics.
--
-- Measured on the live data with a temporary copy of the summary, three repeats:
-- the totals were identical to the live function for the super admin and for both
-- agencies, and the Overview query took
--   super admin (1,959 posts)   0.40 s  ->  0.012 s
--   large agency (1,712 posts)  0.40 s  ->  0.011 s
--   small agency (247 posts)    0.010 s ->  0.007 s
--
-- dashboard_overview also returns by_campaign (peak views per campaign, top 12) for
-- the redesigned Overview. `series` is unchanged, so the Overview that is deployed
-- today keeps working until the new one ships.
--
-- Not covered: TRUNCATE post_metrics. Run  select public.rebuild_post_metric_peaks();
-- after one.
-- To roll back: drop the three post_metrics_peaks_* triggers, then re-create the two
-- functions from 20260917042041_1e8fd67c-8977-4264-b922-b09dfde07a67.sql and
-- 20260730171826_690e55a5-30d0-48e5-9a86-4df5e83b12cb.sql.

CREATE TABLE IF NOT EXISTS public.post_metric_peaks (
  post_id     uuid PRIMARY KEY REFERENCES public.posts(id) ON DELETE CASCADE,
  views       integer,
  likes       integer,
  comments    integer,
  shares      integer,
  saves       integer,
  reach       integer,
  impressions integer
);

-- Read only through the security-definer functions below, never through the API.
ALTER TABLE public.post_metric_peaks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.post_metric_peaks FROM anon, authenticated;

-- Recomputes the peaks of the given posts (every post when none are given) from post_metrics.
CREATE OR REPLACE FUNCTION public.rebuild_post_metric_peaks(_post_ids uuid[] DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  INSERT INTO public.post_metric_peaks AS peaks (post_id, views, likes, comments, shares, saves, reach, impressions)
  SELECT po.id, MAX(pm.views), MAX(pm.likes), MAX(pm.comments), MAX(pm.shares),
         MAX(pm.saves), MAX(pm.reach), MAX(pm.impressions)
    FROM public.posts po
    LEFT JOIN public.post_metrics pm ON pm.post_id = po.id
   WHERE _post_ids IS NULL OR po.id = ANY(_post_ids)
   GROUP BY po.id
  ON CONFLICT (post_id) DO UPDATE SET
    views = EXCLUDED.views, likes = EXCLUDED.likes, comments = EXCLUDED.comments,
    shares = EXCLUDED.shares, saves = EXCLUDED.saves, reach = EXCLUDED.reach,
    impressions = EXCLUDED.impressions;
$function$;
REVOKE EXECUTE ON FUNCTION public.rebuild_post_metric_peaks(uuid[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.post_metric_peaks_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- GREATEST ignores NULLs, like MAX does.
  INSERT INTO public.post_metric_peaks AS peaks (post_id, views, likes, comments, shares, saves, reach, impressions)
  SELECT n.post_id, MAX(n.views), MAX(n.likes), MAX(n.comments), MAX(n.shares),
         MAX(n.saves), MAX(n.reach), MAX(n.impressions)
    FROM new_rows n
   GROUP BY n.post_id
  ON CONFLICT (post_id) DO UPDATE SET
    views = GREATEST(peaks.views, EXCLUDED.views),
    likes = GREATEST(peaks.likes, EXCLUDED.likes),
    comments = GREATEST(peaks.comments, EXCLUDED.comments),
    shares = GREATEST(peaks.shares, EXCLUDED.shares),
    saves = GREATEST(peaks.saves, EXCLUDED.saves),
    reach = GREATEST(peaks.reach, EXCLUDED.reach),
    impressions = GREATEST(peaks.impressions, EXCLUDED.impressions);
  RETURN NULL;
END
$function$;

CREATE OR REPLACE FUNCTION public.post_metric_peaks_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.rebuild_post_metric_peaks(ARRAY(SELECT post_id FROM old_rows UNION SELECT post_id FROM new_rows));
  RETURN NULL;
END
$function$;

CREATE OR REPLACE FUNCTION public.post_metric_peaks_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.rebuild_post_metric_peaks(ARRAY(SELECT DISTINCT post_id FROM old_rows));
  RETURN NULL;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.post_metric_peaks_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_metric_peaks_after_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_metric_peaks_after_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS post_metrics_peaks_insert ON public.post_metrics;
CREATE TRIGGER post_metrics_peaks_insert
  AFTER INSERT ON public.post_metrics
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.post_metric_peaks_after_insert();

DROP TRIGGER IF EXISTS post_metrics_peaks_update ON public.post_metrics;
CREATE TRIGGER post_metrics_peaks_update
  AFTER UPDATE ON public.post_metrics
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.post_metric_peaks_after_update();

DROP TRIGGER IF EXISTS post_metrics_peaks_delete ON public.post_metrics;
CREATE TRIGGER post_metrics_peaks_delete
  AFTER DELETE ON public.post_metrics
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.post_metric_peaks_after_delete();

-- Backfill after the triggers exist. GREATEST keeps any value a trigger wrote while this runs.
INSERT INTO public.post_metric_peaks AS peaks (post_id, views, likes, comments, shares, saves, reach, impressions)
SELECT po.id, MAX(pm.views), MAX(pm.likes), MAX(pm.comments), MAX(pm.shares),
       MAX(pm.saves), MAX(pm.reach), MAX(pm.impressions)
  FROM public.posts po
  LEFT JOIN public.post_metrics pm ON pm.post_id = po.id
 GROUP BY po.id
ON CONFLICT (post_id) DO UPDATE SET
  views = GREATEST(peaks.views, EXCLUDED.views),
  likes = GREATEST(peaks.likes, EXCLUDED.likes),
  comments = GREATEST(peaks.comments, EXCLUDED.comments),
  shares = GREATEST(peaks.shares, EXCLUDED.shares),
  saves = GREATEST(peaks.saves, EXCLUDED.saves),
  reach = GREATEST(peaks.reach, EXCLUDED.reach),
  impressions = GREATEST(peaks.impressions, EXCLUDED.impressions);
ANALYZE public.post_metric_peaks;

CREATE OR REPLACE FUNCTION public.dashboard_overview(_from date, _to date)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH allowed AS (
  SELECT c.id, c.status, c.client_id, c.agency_id
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
    LEFT JOIN public.post_metric_peaks m ON m.post_id = p.id
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
camp_views AS (
  SELECT k.campaign_id AS id, c.name, SUM(k.views) AS views
    FROM peak k JOIN public.campaigns c ON c.id = k.campaign_id
   GROUP BY 1,2
)
SELECT jsonb_build_object(
  'clients', (SELECT COUNT(DISTINCT client_id) FROM allowed WHERE client_id IS NOT NULL),
  'campaigns', (SELECT COUNT(*) FROM allowed),
  'live', (SELECT COUNT(*) FROM allowed WHERE status = 'live'),
  'influencers', (SELECT COUNT(DISTINCT ci.influencer_id) FROM public.campaign_influencers ci JOIN allowed a ON a.id = ci.campaign_id),
  'posts', (SELECT COUNT(*) FROM peak),
  'briefs', (SELECT COUNT(*) FROM public.content_items ci JOIN allowed a ON a.id = ci.campaign_id),
  'contests', (SELECT COUNT(*) FROM public.contests co JOIN allowed a ON a.id = co.campaign_id),
  'totals', (SELECT jsonb_build_object(
      'views', COALESCE(SUM(views),0), 'likes', COALESCE(SUM(likes),0),
      'comments', COALESCE(SUM(comments),0), 'shares', COALESCE(SUM(shares),0),
      'reach', COALESCE(SUM(reach),0)) FROM peak),
  'series', COALESCE((SELECT jsonb_agg(jsonb_build_object('d', d, 'v', v) ORDER BY d) FROM series), '[]'::jsonb),
  'top_post', (SELECT to_jsonb(t) FROM top_post t),
  'top_campaign', (SELECT to_jsonb(t) FROM (SELECT id, name, views FROM camp_views ORDER BY views DESC LIMIT 1) t),
  'by_campaign', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.views DESC) FROM (SELECT id, name, views FROM camp_views ORDER BY views DESC LIMIT 12) t), '[]'::jsonb),
  'recent', COALESCE((SELECT jsonb_agg(r) FROM (
      SELECT c.id, c.name, c.status, c.hashtag, c.budget_kes,
             jsonb_build_object('name', cl.name) AS clients
        FROM public.campaigns c
        JOIN allowed a ON a.id = c.id
        LEFT JOIN public.clients cl ON cl.id = c.client_id
       ORDER BY c.created_at DESC LIMIT 5) r), '[]'::jsonb)
);
$function$;

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
      LEFT JOIN public.post_metric_peaks m ON m.post_id = p.id
  )
  SELECT campaign_id,
         COUNT(*)::bigint,
         SUM(views)::numeric,
         SUM(eng)::numeric
    FROM peak
   GROUP BY campaign_id;
$function$;
