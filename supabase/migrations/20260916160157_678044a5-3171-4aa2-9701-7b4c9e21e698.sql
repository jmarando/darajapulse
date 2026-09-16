ALTER TABLE public.creator_drafts
  ADD COLUMN IF NOT EXISTS stream_uid text,
  ADD COLUMN IF NOT EXISTS stream_status text,
  ADD COLUMN IF NOT EXISTS stream_thumbnail_url text,
  ADD COLUMN IF NOT EXISTS stream_duration numeric;

CREATE INDEX IF NOT EXISTS creator_drafts_stream_uid_idx ON public.creator_drafts (stream_uid) WHERE stream_uid IS NOT NULL;

CREATE OR REPLACE FUNCTION public.submit_creator_draft(_brief_token text, _file_path text, _file_name text, _mime_type text DEFAULT NULL::text, _file_size bigint DEFAULT NULL::bigint, _platform text DEFAULT NULL::text, _caption text DEFAULT NULL::text, _creator_note text DEFAULT NULL::text, _poster_path text DEFAULT NULL::text, _stream_uid text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; _id uuid;
BEGIN
  SELECT ci.id, ci.campaign_id, ci.influencer_id INTO r
  FROM public.campaign_influencers ci WHERE ci.brief_token = _brief_token LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid link'; END IF;
  IF (_file_path IS NULL OR length(_file_path) < 3) AND (_stream_uid IS NULL OR length(_stream_uid) < 6) THEN
    RAISE EXCEPTION 'file required';
  END IF;

  INSERT INTO public.creator_drafts (campaign_id, campaign_influencer_id, influencer_id, file_path, file_name, mime_type, file_size, platform, caption, creator_note, poster_path, stream_uid, stream_status)
  VALUES (r.campaign_id, r.id, r.influencer_id, _file_path, _file_name, _mime_type, _file_size, _platform, _caption, _creator_note, _poster_path, _stream_uid,
          CASE WHEN _stream_uid IS NOT NULL THEN 'processing' ELSE NULL END)
  RETURNING id INTO _id;
  RETURN _id;
END $function$;

DROP FUNCTION IF EXISTS public.get_creator_drafts(text);

CREATE OR REPLACE FUNCTION public.get_creator_drafts(_brief_token text)
 RETURNS TABLE(id uuid, file_name text, platform text, status text, review_note text, caption text, created_at timestamp with time zone, reviewed_at timestamp with time zone, post_url text, stream_status text, stream_thumbnail_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.id, d.file_name, d.platform, d.status, d.review_note, d.caption, d.created_at, d.reviewed_at, d.post_url, d.stream_status, d.stream_thumbnail_url
  FROM public.creator_drafts d
  JOIN public.campaign_influencers ci ON ci.id = d.campaign_influencer_id
  WHERE ci.brief_token = _brief_token
  ORDER BY d.created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_creator_draft_state(_brief_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'required', COALESCE(c.require_draft_approval, false),
    'drafts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id,
        'file_name', d.file_name,
        'platform', d.platform,
        'status', d.status,
        'review_note', d.review_note,
        'created_at', d.created_at,
        'reviewed_at', d.reviewed_at,
        'post_url', d.post_url,
        'stream_status', d.stream_status
      ) ORDER BY d.created_at DESC)
      FROM public.creator_drafts d
      WHERE d.campaign_influencer_id = ci.id
    ), '[]'::jsonb),
    'approved_available', EXISTS (
      SELECT 1 FROM public.creator_drafts d
      WHERE d.campaign_influencer_id = ci.id AND d.status = 'approved' AND d.post_url IS NULL
    )
  )
  FROM public.campaign_influencers ci
  JOIN public.campaigns c ON c.id = ci.campaign_id
  WHERE ci.brief_token = _brief_token
  LIMIT 1;
$function$;