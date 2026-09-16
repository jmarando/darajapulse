
CREATE OR REPLACE FUNCTION public.refresh_deliverable_suggestions(_campaign_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
BEGIN
  IF NOT public.user_has_campaign_access(auth.uid(), _campaign_id) THEN
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
$$;

REVOKE ALL ON FUNCTION public.refresh_deliverable_suggestions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_deliverable_suggestions(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.merge_posts_into_deliverable(_post_ids uuid[], _target_deliverable_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid := _target_deliverable_id;
  camp uuid;
  p record;
BEGIN
  SELECT campaign_id INTO camp FROM public.posts WHERE id = ANY(_post_ids) LIMIT 1;
  IF camp IS NULL OR NOT public.user_has_campaign_access(auth.uid(), camp) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF target IS NULL THEN
    SELECT deliverable_id INTO target FROM public.posts
      WHERE id = ANY(_post_ids) AND deliverable_id IS NOT NULL LIMIT 1;
  END IF;

  IF target IS NULL THEN
    SELECT p2.id INTO target FROM (
      SELECT (INSERT_RESULT).id FROM (SELECT NULL) x
    ) p2;
  END IF;

  IF target IS NULL THEN
    RAISE EXCEPTION 'No deliverable to merge into';
  END IF;

  UPDATE public.posts SET deliverable_id = target WHERE id = ANY(_post_ids);

  UPDATE public.campaign_deliverables d
     SET expected_platforms = (SELECT array_agg(DISTINCT p.platform::text) FROM public.posts p WHERE p.deliverable_id = d.id)
   WHERE d.id = target;

  DELETE FROM public.campaign_deliverables d
   WHERE d.campaign_id = camp
     AND d.id <> target
     AND NOT EXISTS (SELECT 1 FROM public.posts p WHERE p.deliverable_id = d.id)
     AND d.source_draft_id IS NULL;

  UPDATE public.deliverable_link_suggestions
     SET status = 'accepted'
   WHERE status = 'pending'
     AND post_id = ANY(_post_ids) AND other_post_id = ANY(_post_ids);

  RETURN target;
END
$$;

REVOKE ALL ON FUNCTION public.merge_posts_into_deliverable(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_posts_into_deliverable(uuid[], uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.detach_post_to_own_deliverable(_post_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
  new_id uuid;
BEGIN
  SELECT * INTO p FROM public.posts WHERE id = _post_id;
  IF p IS NULL OR NOT public.user_has_campaign_access(auth.uid(), p.campaign_id) THEN
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
$$;

REVOKE ALL ON FUNCTION public.detach_post_to_own_deliverable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detach_post_to_own_deliverable(uuid) TO authenticated;
