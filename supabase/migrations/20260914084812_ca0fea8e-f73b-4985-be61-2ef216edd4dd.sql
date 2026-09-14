ALTER TABLE public.creator_drafts ADD COLUMN IF NOT EXISTS poster_path text;

CREATE OR REPLACE FUNCTION public.submit_creator_draft(_brief_token text, _file_path text, _file_name text, _mime_type text DEFAULT NULL::text, _file_size bigint DEFAULT NULL::bigint, _platform text DEFAULT NULL::text, _caption text DEFAULT NULL::text, _creator_note text DEFAULT NULL::text, _poster_path text DEFAULT NULL::text)
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
  IF _file_path IS NULL OR length(_file_path) < 3 THEN RAISE EXCEPTION 'file required'; END IF;

  INSERT INTO public.creator_drafts (campaign_id, campaign_influencer_id, influencer_id, file_path, file_name, mime_type, file_size, platform, caption, creator_note, poster_path)
  VALUES (r.campaign_id, r.id, r.influencer_id, _file_path, _file_name, _mime_type, _file_size, _platform, _caption, _creator_note, _poster_path)
  RETURNING id INTO _id;
  RETURN _id;
END $function$;