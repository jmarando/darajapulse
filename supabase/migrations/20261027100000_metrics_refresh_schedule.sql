-- Metrics refresh: pick due posts in SQL, on a milestone schedule, one run at a time.
--
-- Why: fetch-public-metrics read every post and every snapshot through the API,
-- and PostgREST returns at most 1,000 rows per call. With 1,963 posts, later posts
-- were cut off, and snapshot reads of 500 posts returned only the first 1,000
-- snapshots, so most posts looked never fetched and were scraped again on every
-- run (2.4 to 10.2 snapshots per post per day, about 14,800 paid credits a week).
--
-- What:
--   post_fetch_state      last attempt per post (success or failure), so a post
--                         that can't be scraped stops being retried every run.
--   metrics_due_posts()   the posts due now, worked out in SQL with no row cap.
--   record_post_fetch()   marks an attempt.
--   take_job_lock() / release_job_lock()   one scheduled run at a time.
--
-- Schedule: a post is read when first added, then on day 1, 3, 7, 14 and 30 after
-- it went live. After day 30 the scheduler leaves it alone; staff can still refresh
-- a campaign by hand (for example the final reading before payment). Draft
-- campaigns are skipped. A failed read is retried after 6 hours, up to 3 times,
-- then once more at each later milestone.
--
-- The four functions above are service-role only: fetch-public-metrics calls them.
-- dashboard_overview and campaign_perf_summary now fill in unreported figures
-- (see metric_fallbacks below).
-- To roll back: drop the five new functions and the two tables, then re-create
-- dashboard_overview and campaign_perf_summary from 20261026133000.

CREATE TABLE IF NOT EXISTS public.post_fetch_state (
  post_id     uuid PRIMARY KEY REFERENCES public.posts(id) ON DELETE CASCADE,
  checked_at  timestamptz NOT NULL DEFAULT now(),
  failures    integer NOT NULL DEFAULT 0,
  last_error  text
);
ALTER TABLE public.post_fetch_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.post_fetch_state FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.job_locks (
  name          text PRIMARY KEY,
  locked_until  timestamptz NOT NULL
);
ALTER TABLE public.job_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_locks FROM anon, authenticated;

-- Speeds up "latest snapshot per post".
CREATE INDEX IF NOT EXISTS post_metrics_post_captured_idx ON public.post_metrics (post_id, captured_at DESC);

-- _min_gap NULL: scheduled mode (milestones). _min_gap set: every post in the
-- campaign not read or attempted within that gap (a manual campaign refresh).
CREATE OR REPLACE FUNCTION public.metrics_due_posts(_limit integer, _campaign_id uuid DEFAULT NULL, _min_gap interval DEFAULT NULL)
RETURNS TABLE(post_id uuid, total_due bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH candidates AS (
    SELECT p.id,
           COALESCE(p.posted_at, p.created_at) AS live_at,
           (SELECT max(pm.captured_at) FROM public.post_metrics pm WHERE pm.post_id = p.id) AS last_read,
           s.checked_at,
           COALESCE(s.failures, 0) AS failures
      FROM public.posts p
      JOIN public.campaigns c ON c.id = p.campaign_id
      LEFT JOIN public.post_fetch_state s ON s.post_id = p.id
     WHERE p.post_url IS NOT NULL AND p.post_url <> ''
       -- The schedule skips draft campaigns; a manual refresh covers them too.
       AND (_min_gap IS NOT NULL OR c.status <> 'draft')
       AND (_campaign_id IS NULL OR p.campaign_id = _campaign_id)
  ),
  staged AS (
    SELECT cd.*,
           -- The most recent milestone this post has reached (day 0 = first reading).
           cd.live_at + make_interval(days => (
             SELECT max(m) FROM unnest(ARRAY[0, 1, 3, 7, 14, 30]) AS m
              WHERE cd.live_at + make_interval(days => m) <= now()
           )) AS milestone_at
      FROM candidates cd
  ),
  due AS (
    SELECT st.id, st.last_read, st.live_at
      FROM staged st
     WHERE CASE
       WHEN _min_gap IS NOT NULL THEN
         GREATEST(st.last_read, st.checked_at) IS NULL OR GREATEST(st.last_read, st.checked_at) < now() - _min_gap
       ELSE
         (st.last_read IS NULL OR st.last_read < COALESCE(st.milestone_at, st.live_at))
         AND (st.checked_at IS NULL
              OR st.checked_at < COALESCE(st.milestone_at, st.live_at)
              OR (st.failures < 3 AND st.checked_at < now() - interval '6 hours'))
     END
  )
  SELECT d.id, count(*) OVER ()
    FROM due d
   ORDER BY d.last_read NULLS FIRST, d.live_at DESC
   LIMIT GREATEST(_limit, 0);
$function$;

CREATE OR REPLACE FUNCTION public.record_post_fetch(_post_id uuid, _ok boolean, _error text DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  INSERT INTO public.post_fetch_state AS s (post_id, checked_at, failures, last_error)
  VALUES (_post_id, now(), CASE WHEN _ok THEN 0 ELSE 1 END, CASE WHEN _ok THEN NULL ELSE left(_error, 500) END)
  ON CONFLICT (post_id) DO UPDATE SET
    checked_at = now(),
    failures = CASE WHEN _ok THEN 0 ELSE s.failures + 1 END,
    last_error = CASE WHEN _ok THEN NULL ELSE left(_error, 500) END;
$function$;

-- True when the caller now holds the lock; false while another run holds it.
-- A lock left by a run that crashed expires after _seconds.
CREATE OR REPLACE FUNCTION public.take_job_lock(_name text, _seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.job_locks AS l (name, locked_until)
  VALUES (_name, now() + make_interval(secs => _seconds))
  ON CONFLICT (name) DO UPDATE SET locked_until = EXCLUDED.locked_until
    WHERE l.locked_until < now();
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_job_lock(_name text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  DELETE FROM public.job_locks WHERE name = _name;
$function$;

REVOKE EXECUTE ON FUNCTION public.metrics_due_posts(integer, uuid, interval) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_post_fetch(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.take_job_lock(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_job_lock(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.metrics_due_posts(integer, uuid, interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_post_fetch(uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.take_job_lock(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_job_lock(text) TO service_role;

-- Estimates are no longer stored (fetch-public-metrics and tiktok-poll keep only
-- what the platform reported). The dashboards fill unreported shares, saves and
-- reach in the same way the app does (withMetricFallbacks in src/lib/metrics.ts),
-- so their totals don't drop for new posts. Only the peak CTEs change below; the
-- rest of both functions is as in 20261026133000_faster_dashboard_metrics.sql.
CREATE OR REPLACE FUNCTION public.metric_fallbacks(_views integer, _likes integer, _comments integer, _shares integer, _saves integer, _reach integer)
RETURNS TABLE(views bigint, likes bigint, comments bigint, shares bigint, saves bigint, reach bigint)
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT v, l, c,
         CASE WHEN COALESCE(_shares, 0) > 0 THEN _shares::bigint WHEN v > 0 THEN round(GREATEST(v * 0.0025, l * 0.06, c * 1.2))::bigint ELSE 0 END,
         CASE WHEN COALESCE(_saves, 0) > 0 THEN _saves::bigint WHEN v > 0 THEN round(GREATEST(v * 0.0035, l * 0.08, c * 1.5))::bigint ELSE 0 END,
         CASE WHEN COALESCE(_reach, 0) > 0 THEN _reach::bigint WHEN v > 0 THEN round(v * 0.68)::bigint ELSE 0 END
    FROM (SELECT GREATEST(COALESCE(_views, 0), 0)::bigint AS v,
                 GREATEST(COALESCE(_likes, 0), 0)::bigint AS l,
                 GREATEST(COALESCE(_comments, 0), 0)::bigint AS c) x;
$function$;

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
         f.views, f.likes, f.comments, f.shares, f.reach
    FROM public.posts p
    JOIN allowed a ON a.id = p.campaign_id
    LEFT JOIN public.post_metric_peaks m ON m.post_id = p.id
    CROSS JOIN LATERAL public.metric_fallbacks(m.views, m.likes, m.comments, m.shares, m.saves, m.reach) f
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
           f.views,
           f.likes + f.comments + f.shares + f.saves AS eng
      FROM public.posts p
      JOIN allowed a ON a.id = p.campaign_id
      LEFT JOIN public.post_metric_peaks m ON m.post_id = p.id
      CROSS JOIN LATERAL public.metric_fallbacks(m.views, m.likes, m.comments, m.shares, m.saves, m.reach) f
  )
  SELECT campaign_id,
         COUNT(*)::bigint,
         SUM(views)::numeric,
         SUM(eng)::numeric
    FROM peak
   GROUP BY campaign_id;
$function$;
