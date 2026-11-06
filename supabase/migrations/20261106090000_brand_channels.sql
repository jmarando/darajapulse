-- Brand channels: a brand's own Facebook, Instagram and TikTok accounts, read every night, for the organic report.
--
-- Why: Pulse only knew a brand through campaigns and Listening. Its own pages were invisible.
--
-- What:
--   * brand_channels: one row per account, on public numbers from the day it is added. Signed-in people may add only a
--     brand, a platform and a handle, so nobody but the service role can set where the numbers come from.
--   * brand_channel_days: one line per channel per Nairobi day (followers). A failed read writes no line.
--   * brand_posts, brand_post_metrics: the channel's posts and each reading of them. A number no source gave stays
--     null, never 0. Written by the service role only.
--   * brand_pull_credits and take_brand_pull_credits: a daily allowance of public calls per agency, as Listening's.
--   * can_view_brand_channels (super admins, the brand's portal users, agency staff of its agency) and
--     can_manage_brand_channels (the same without portal users).
--   * brand_report_doc: everything a period's report needs, for the brand's channels only. Internal.
--   * get_brand_report_rows: the same behind the view rule, for signed-in people.
--   * An internal_job_keys row named brand-channels-sync. The key is made by the table's default. The cron job below
--     presents it for you; never read it out of a query's output.
--   * Cron job brand-channels-sync-nightly every 15 minutes from 01:00 to 02:45 UTC: one run is held to 110 seconds,
--     so each takes whatever is still due. A run with nothing due costs one query.
--
-- Checked with supabase/verify/brand_channels.sql inside a rolled-back DO block.
--
-- To roll back:
--   SELECT cron.unschedule('brand-channels-sync-nightly');
--   DELETE FROM public.internal_job_keys WHERE name = 'brand-channels-sync';
--   DROP TABLE IF EXISTS public.brand_post_metrics, public.brand_posts, public.brand_channel_days, public.brand_channels, public.brand_pull_credits;
--   DROP FUNCTION IF EXISTS public.get_brand_report_rows(uuid, date, date);
--   DROP FUNCTION IF EXISTS public.brand_report_doc(uuid, date, date);
--   DROP FUNCTION IF EXISTS public.take_brand_pull_credits(uuid, integer, integer);
--   DROP FUNCTION IF EXISTS public.can_manage_brand_channels(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.can_view_brand_channels(uuid, uuid);

CREATE TABLE IF NOT EXISTS public.brand_channels (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  platform           public.platform NOT NULL CHECK (platform IN ('facebook', 'instagram', 'tiktok')),
  handle             text NOT NULL CHECK (handle ~ '^[a-z0-9._-]{1,100}$'),
  external_id        text,
  display_name       text,
  avatar_url         text,
  source             text NOT NULL DEFAULT 'public' CHECK (source IN ('public', 'connected')),
  status             text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'needs_reconnect', 'paused', 'error')),
  status_note        text,
  connected_at       timestamptz,
  connected_by_name  text,
  connected_by       uuid,
  audience           jsonb,
  audience_at        timestamptz,
  last_pull_at       timestamptz,
  last_good_pull_at  timestamptz,
  created_by         uuid DEFAULT auth.uid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, platform, handle)
);

CREATE TABLE IF NOT EXISTS public.brand_channel_days (
  channel_id  uuid NOT NULL REFERENCES public.brand_channels(id) ON DELETE CASCADE,
  day         date NOT NULL,
  followers   bigint,
  source      text NOT NULL CHECK (source IN ('meta', 'scrapecreators')),
  pulled_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, day)
);

CREATE TABLE IF NOT EXISTS public.brand_posts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id     uuid NOT NULL REFERENCES public.brand_channels(id) ON DELETE CASCADE,
  external_id    text NOT NULL,
  url            text,
  posted_at      timestamptz,
  format         text NOT NULL DEFAULT 'other' CHECK (format IN ('video', 'photo', 'carousel', 'text', 'other')),
  caption        text,
  thumbnail_url  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, external_id)
);
CREATE INDEX IF NOT EXISTS brand_posts_channel_posted_idx ON public.brand_posts (channel_id, posted_at);

CREATE TABLE IF NOT EXISTS public.brand_post_metrics (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      uuid NOT NULL REFERENCES public.brand_posts(id) ON DELETE CASCADE,
  captured_at  timestamptz NOT NULL DEFAULT now(),
  views        bigint,
  likes        bigint,
  comments     bigint,
  shares       bigint,
  saves        bigint,
  reach        bigint,
  views_paid   bigint,
  source       text NOT NULL
);
CREATE INDEX IF NOT EXISTS brand_post_metrics_post_captured_idx ON public.brand_post_metrics (post_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS public.brand_pull_credits (
  agency_id  uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  day        date NOT NULL,
  used       integer NOT NULL DEFAULT 0 CHECK (used >= 0),
  PRIMARY KEY (agency_id, day)
);

-- Super admins, the brand's portal users, and agency staff of the brand's agency.
CREATE OR REPLACE FUNCTION public.can_view_brand_channels(_user_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_super_admin(_user_id)
      OR public.user_has_client_access(_user_id, _client_id)
      OR EXISTS (
        SELECT 1 FROM public.clients c
        JOIN public.user_roles ur
          ON ur.user_id = _user_id
         AND ur.agency_id = c.agency_id
         AND ur.role IN ('agency_admin', 'account_manager')
       WHERE c.id = _client_id
      );
$function$;
REVOKE EXECUTE ON FUNCTION public.can_view_brand_channels(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_brand_channels(uuid, uuid) TO authenticated, service_role;

-- The same without portal users: adding handles and making links stays with the agency.
CREATE OR REPLACE FUNCTION public.can_manage_brand_channels(_user_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_super_admin(_user_id)
      OR EXISTS (
        SELECT 1 FROM public.clients c
        JOIN public.user_roles ur
          ON ur.user_id = _user_id
         AND ur.agency_id = c.agency_id
         AND ur.role IN ('agency_admin', 'account_manager')
       WHERE c.id = _client_id
      );
$function$;
REVOKE EXECUTE ON FUNCTION public.can_manage_brand_channels(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_brand_channels(uuid, uuid) TO authenticated, service_role;

ALTER TABLE public.brand_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_channel_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_post_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_pull_credits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.brand_channels, public.brand_channel_days, public.brand_posts, public.brand_post_metrics, public.brand_pull_credits FROM anon, authenticated;
GRANT SELECT, DELETE ON public.brand_channels TO authenticated;
GRANT INSERT (client_id, platform, handle) ON public.brand_channels TO authenticated;
GRANT SELECT ON public.brand_channel_days, public.brand_posts, public.brand_post_metrics TO authenticated;

DROP POLICY IF EXISTS "Brand channels: read" ON public.brand_channels;
DROP POLICY IF EXISTS "Brand channels: add" ON public.brand_channels;
DROP POLICY IF EXISTS "Brand channels: remove" ON public.brand_channels;
CREATE POLICY "Brand channels: read" ON public.brand_channels FOR SELECT TO authenticated
  USING (public.can_view_brand_channels(auth.uid(), client_id));
CREATE POLICY "Brand channels: add" ON public.brand_channels FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_brand_channels(auth.uid(), client_id));
CREATE POLICY "Brand channels: remove" ON public.brand_channels FOR DELETE TO authenticated
  USING (public.can_manage_brand_channels(auth.uid(), client_id));

DROP POLICY IF EXISTS "Brand channel days: read" ON public.brand_channel_days;
CREATE POLICY "Brand channel days: read" ON public.brand_channel_days FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.brand_channels c WHERE c.id = channel_id AND public.can_view_brand_channels(auth.uid(), c.client_id)));

DROP POLICY IF EXISTS "Brand posts: read" ON public.brand_posts;
CREATE POLICY "Brand posts: read" ON public.brand_posts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.brand_channels c WHERE c.id = channel_id AND public.can_view_brand_channels(auth.uid(), c.client_id)));

DROP POLICY IF EXISTS "Brand post metrics: read" ON public.brand_post_metrics;
CREATE POLICY "Brand post metrics: read" ON public.brand_post_metrics FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.brand_posts p JOIN public.brand_channels c ON c.id = p.channel_id
     WHERE p.id = post_id AND public.can_view_brand_channels(auth.uid(), c.client_id)
  ));

-- True when the agency has room left in today's allowance (a Nairobi day), which it then uses.
CREATE OR REPLACE FUNCTION public.take_brand_pull_credits(_agency_id uuid, _n integer, _cap integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _day date := (now() AT TIME ZONE 'Africa/Nairobi')::date;
  _ok boolean;
BEGIN
  IF _n <= 0 THEN
    RETURN true;
  END IF;
  INSERT INTO public.brand_pull_credits (agency_id, day) VALUES (_agency_id, _day)
  ON CONFLICT (agency_id, day) DO NOTHING;
  UPDATE public.brand_pull_credits
     SET used = used + _n
   WHERE agency_id = _agency_id AND day = _day AND used + _n <= _cap
  RETURNING true INTO _ok;
  RETURN coalesce(_ok, false);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.take_brand_pull_credits(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.take_brand_pull_credits(uuid, integer, integer) TO service_role;

-- Everything a period's report needs, for one brand. Periods are whole days in Nairobi; the previous period is the same
-- length, immediately before. Each post carries one reading: the latest taken before its period ended, or, for a post
-- first read after that, its earliest (counted_late). Visitors with a share link get this same document, so it holds
-- no staff notes and nothing about who connected what.
CREATE OR REPLACE FUNCTION public.brand_report_doc(_client_id uuid, _from date, _to date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH b AS (
    SELECT _from - (_to - _from + 1) AS prev_from,
           _from - 1 AS prev_to,
           (_from - (_to - _from + 1))::timestamp AT TIME ZONE 'Africa/Nairobi' AS prev_start,
           _from::timestamp AT TIME ZONE 'Africa/Nairobi' AS cur_start,
           (_to + 1)::timestamp AT TIME ZONE 'Africa/Nairobi' AS cur_end
  ),
  ch AS (
    SELECT c.* FROM public.brand_channels c WHERE c.client_id = _client_id
  ),
  picked AS (
    SELECT p.id, p.channel_id, p.url, p.posted_at, p.format, p.caption, p.thumbnail_url,
           CASE WHEN p.posted_at >= b.cur_start THEN 'current' ELSE 'previous' END AS period,
           CASE
             WHEN i.captured_at IS NOT NULL THEN jsonb_build_object(
               'views', i.views, 'likes', i.likes, 'comments', i.comments, 'shares', i.shares, 'saves', i.saves,
               'reach', i.reach, 'views_paid', i.views_paid, 'source', i.source, 'captured_at', i.captured_at, 'counted_late', false)
             WHEN l.captured_at IS NOT NULL THEN jsonb_build_object(
               'views', l.views, 'likes', l.likes, 'comments', l.comments, 'shares', l.shares, 'saves', l.saves,
               'reach', l.reach, 'views_paid', l.views_paid, 'source', l.source, 'captured_at', l.captured_at, 'counted_late', true)
           END AS snapshot
      FROM public.brand_posts p
      JOIN ch ON ch.id = p.channel_id
      CROSS JOIN b
      LEFT JOIN LATERAL (
        SELECT m.* FROM public.brand_post_metrics m
         WHERE m.post_id = p.id
           AND m.captured_at < CASE WHEN p.posted_at >= b.cur_start THEN b.cur_end ELSE b.cur_start END
         ORDER BY m.captured_at DESC
         LIMIT 1
      ) i ON true
      LEFT JOIN LATERAL (
        SELECT m.* FROM public.brand_post_metrics m
         WHERE i.captured_at IS NULL AND m.post_id = p.id
         ORDER BY m.captured_at ASC
         LIMIT 1
      ) l ON true
     WHERE p.posted_at >= b.prev_start AND p.posted_at < b.cur_end
  ),
  lines AS (
    SELECT d.channel_id, d.day, d.followers, d.source
      FROM public.brand_channel_days d
      JOIN ch ON ch.id = d.channel_id
      CROSS JOIN b
     WHERE d.day >= b.prev_from AND d.day <= _to
    UNION ALL
    SELECT x.channel_id, x.day, x.followers, x.source
      FROM ch
      CROSS JOIN b
      CROSS JOIN LATERAL (
        SELECT d.channel_id, d.day, d.followers, d.source
          FROM public.brand_channel_days d
         WHERE d.channel_id = ch.id AND d.day < b.prev_from
         ORDER BY d.day DESC
         LIMIT 1
      ) x
  )
  SELECT jsonb_build_object(
    'client', (SELECT jsonb_build_object('name', c.name, 'logo_url', c.logo_url) FROM public.clients c WHERE c.id = _client_id),
    'from', _from,
    'to', _to,
    'previous_from', (SELECT prev_from FROM b),
    'previous_to', (SELECT prev_to FROM b),
    'channels', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ch.id, 'platform', ch.platform, 'handle', ch.handle, 'display_name', ch.display_name,
        'avatar_url', ch.avatar_url, 'source', ch.source, 'status', ch.status,
        'last_good_pull_at', ch.last_good_pull_at, 'audience', ch.audience
      ) ORDER BY ch.platform, ch.handle) FROM ch), '[]'::jsonb),
    'days', COALESCE((SELECT jsonb_agg(to_jsonb(lines)) FROM lines), '[]'::jsonb),
    'posts', COALESCE((SELECT jsonb_agg(to_jsonb(picked) ORDER BY picked.posted_at) FROM picked), '[]'::jsonb)
  );
$function$;
REVOKE EXECUTE ON FUNCTION public.brand_report_doc(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brand_report_doc(uuid, date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.get_brand_report_rows(_client_id uuid, _from date, _to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.can_view_brand_channels(auth.uid(), _client_id) THEN
    RAISE EXCEPTION 'You do not have access to this brand.' USING ERRCODE = '42501';
  END IF;
  IF _to < _from OR _to - _from > 366 THEN
    RAISE EXCEPTION 'Pick a period of up to a year.' USING ERRCODE = '22023';
  END IF;
  RETURN public.brand_report_doc(_client_id, _from, _to);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_brand_report_rows(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_brand_report_rows(uuid, date, date) TO authenticated;

INSERT INTO public.internal_job_keys(name) VALUES ('brand-channels-sync') ON CONFLICT (name) DO NOTHING;

SELECT cron.schedule('brand-channels-sync-nightly', '*/15 1-2 * * *',
  $$SELECT public.invoke_job_function('brand-channels-sync', '{}'::jsonb)$$);
