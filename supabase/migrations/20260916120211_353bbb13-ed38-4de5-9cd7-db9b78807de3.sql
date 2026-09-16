CREATE OR REPLACE FUNCTION public.reporting_publications(_campaign_ids uuid[] DEFAULT NULL::uuid[], _from timestamp with time zone DEFAULT NULL::timestamp with time zone, _to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(post_id uuid, deliverable_id uuid, deliverable_title text, deliverable_status text, deliverable_content_type text, deliverable_due_date date, campaign_id uuid, campaign_name text, campaign_status text, client_id uuid, client_name text, influencer_id uuid, influencer_name text, influencer_handle text, platform text, post_url text, caption text, thumbnail_url text, post_status text, posted_at timestamp with time zone, views numeric, likes numeric, comments numeric, shares numeric, saves numeric, reach numeric, impressions numeric, last_synced timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id,
    p.deliverable_id,
    d.title,
    d.status,
    d.content_type,
    d.due_date,
    c.id,
    c.name,
    c.status::text,
    cl.id,
    cl.name,
    i.id,
    i.full_name,
    i.handle,
    p.platform::text,
    p.post_url,
    p.caption,
    p.thumbnail_url,
    p.status::text,
    coalesce(p.posted_at, p.created_at),
    m.views, m.likes, m.comments, m.shares, m.saves, m.reach, m.impressions,
    m.captured_at
  FROM public.posts p
  JOIN public.campaigns c ON c.id = p.campaign_id
  LEFT JOIN public.clients cl ON cl.id = c.client_id
  LEFT JOIN public.influencers i ON i.id = p.influencer_id
  LEFT JOIN public.campaign_deliverables d ON d.id = p.deliverable_id
  LEFT JOIN LATERAL (
    SELECT max(pm.views) views, max(pm.likes) likes, max(pm.comments) comments,
           max(pm.shares) shares, max(pm.saves) saves, max(pm.reach) reach,
           max(pm.impressions) impressions, max(pm.captured_at) captured_at
    FROM public.post_metrics pm WHERE pm.post_id = p.id
  ) m ON true
  WHERE (_campaign_ids IS NULL OR p.campaign_id = ANY(_campaign_ids))
    AND (_from IS NULL OR coalesce(p.posted_at, p.created_at) >= _from)
    AND (_to IS NULL OR coalesce(p.posted_at, p.created_at) <= _to)
    AND (
      public.agency_staff_on_campaign(auth.uid(), p.campaign_id)
      OR public.user_has_campaign_access(auth.uid(), p.campaign_id)
    )
$function$;

CREATE OR REPLACE FUNCTION public.refresh_deliverable_suggestions(_campaign_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  n integer := 0;
BEGIN
  IF NOT (public.agency_staff_on_campaign(auth.uid(), _campaign_id)
          OR public.user_has_campaign_access(auth.uid(), _campaign_id)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  WITH pairs AS (
    SELECT a.id AS post_id, b.id AS other_post_id, a.campaign_id, a.influencer_id,
      CASE WHEN public.caption_key(a.caption) = public.caption_key(b.caption)
           THEN 'Identical caption on a different platform within 7 days'
           ELSE 'Very similar caption on a different platform within 7 days' END AS reason,
      CASE WHEN public.caption_key(a.caption) = public.caption_key(b.caption) THEN 0.9 ELSE 0.7 END AS confidence
    FROM public.posts a
    JOIN public.posts b
      ON b.campaign_id = a.campaign_id
     AND b.influencer_id = a.influencer_id
     AND b.platform <> a.platform
     AND b.id > a.id
     AND coalesce(b.deliverable_id, '00000000-0000-0000-0000-000000000000') <> coalesce(a.deliverable_id, '00000000-0000-0000-0000-000000000001')
     AND abs(extract(epoch FROM (coalesce(b.posted_at, b.created_at) - coalesce(a.posted_at, a.created_at)))) < 604800
     AND (
       public.caption_key(a.caption) = public.caption_key(b.caption)
       OR (length(public.caption_key(a.caption)) >= 30
           AND length(public.caption_key(b.caption)) >= 30
           AND left(public.caption_key(a.caption), 30) = left(public.caption_key(b.caption), 30))
     )
    WHERE a.campaign_id = _campaign_id
      AND a.caption IS NOT NULL AND b.caption IS NOT NULL
      AND length(public.caption_key(a.caption)) >= 20
  )
  INSERT INTO public.deliverable_link_suggestions (campaign_id, influencer_id, post_id, other_post_id, reason, confidence)
  SELECT campaign_id, influencer_id, post_id, other_post_id, reason, confidence FROM pairs
  ON CONFLICT (post_id, other_post_id) DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$function$;

CREATE OR REPLACE FUNCTION public.merge_posts_into_deliverable(_post_ids uuid[], _target_deliverable_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target uuid := _target_deliverable_id;
  camp uuid;
  p record;
BEGIN
  SELECT campaign_id INTO camp FROM public.posts WHERE id = ANY(_post_ids) LIMIT 1;
  IF camp IS NULL OR NOT (public.agency_staff_on_campaign(auth.uid(), camp)
                          OR public.user_has_campaign_access(auth.uid(), camp)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF target IS NULL THEN
    SELECT deliverable_id INTO target FROM public.posts
      WHERE id = ANY(_post_ids) AND deliverable_id IS NOT NULL LIMIT 1;
  END IF;

  IF target IS NULL THEN
    SELECT * INTO p FROM public.posts WHERE id = ANY(_post_ids) ORDER BY coalesce(posted_at, created_at) LIMIT 1;
    INSERT INTO public.campaign_deliverables (campaign_id, influencer_id, title, content_type, description, expected_platforms, status)
    VALUES (p.campaign_id, p.influencer_id,
            left(regexp_replace(coalesce(nullif(trim(p.caption), ''), 'Untitled post'), '\s+', ' ', 'g'), 80),
            'video', p.caption, ARRAY[p.platform::text], 'published')
    RETURNING id INTO target;
  END IF;

  UPDATE public.posts SET deliverable_id = target WHERE id = ANY(_post_ids);

  UPDATE public.campaign_deliverables d
     SET expected_platforms = coalesce((SELECT array_agg(DISTINCT p2.platform::text) FROM public.posts p2 WHERE p2.deliverable_id = d.id), '{}')
   WHERE d.id = target;

  DELETE FROM public.campaign_deliverables d
   WHERE d.campaign_id = camp
     AND d.id <> target
     AND NOT EXISTS (SELECT 1 FROM public.posts p2 WHERE p2.deliverable_id = d.id)
     AND d.source_draft_id IS NULL;

  UPDATE public.deliverable_link_suggestions
     SET status = 'accepted'
   WHERE status = 'pending'
     AND post_id = ANY(_post_ids) AND other_post_id = ANY(_post_ids);

  RETURN target;
END
$function$;

CREATE OR REPLACE FUNCTION public.detach_post_to_own_deliverable(_post_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p record;
  new_id uuid;
BEGIN
  SELECT * INTO p FROM public.posts WHERE id = _post_id;
  IF p IS NULL OR NOT (public.agency_staff_on_campaign(auth.uid(), p.campaign_id)
                       OR public.user_has_campaign_access(auth.uid(), p.campaign_id)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  INSERT INTO public.campaign_deliverables (campaign_id, influencer_id, title, content_type, description, expected_platforms, status)
  VALUES (p.campaign_id, p.influencer_id,
          left(regexp_replace(coalesce(nullif(trim(p.caption), ''), 'Untitled post'), '\s+', ' ', 'g'), 80),
          'video', p.caption, ARRAY[p.platform::text], 'published')
  RETURNING id INTO new_id;

  UPDATE public.posts SET deliverable_id = new_id WHERE id = _post_id;

  UPDATE public.campaign_deliverables d
     SET expected_platforms = coalesce((SELECT array_agg(DISTINCT p2.platform::text) FROM public.posts p2 WHERE p2.deliverable_id = d.id), '{}')
   WHERE d.id = p.deliverable_id;

  UPDATE public.deliverable_link_suggestions SET status = 'dismissed'
   WHERE status = 'pending' AND (post_id = _post_id OR other_post_id = _post_id);

  RETURN new_id;
END
$function$;