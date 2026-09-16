
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
$$;
