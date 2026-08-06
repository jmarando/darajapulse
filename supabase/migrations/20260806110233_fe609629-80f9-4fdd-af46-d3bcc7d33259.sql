DROP FUNCTION IF EXISTS public.submit_contest_entry(text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.submit_contest_entry(
  _token text,
  _platform text,
  _post_url text,
  _handle text,
  _submitter_name text,
  _submitter_email text,
  _brief_token text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _contest_id uuid;
  _campaign_id uuid;
  _influencer_id uuid;
  _entry_id uuid;
  _post_id uuid;
BEGIN
  SELECT id, campaign_id INTO _contest_id, _campaign_id
    FROM public.contests WHERE submission_token = _token AND is_active LIMIT 1;
  IF _contest_id IS NULL THEN RAISE EXCEPTION 'invalid contest token'; END IF;
  IF _post_url IS NULL OR length(_post_url) < 8 THEN RAISE EXCEPTION 'post_url required'; END IF;

  IF _brief_token IS NOT NULL THEN
    SELECT ci.influencer_id, ci.campaign_id INTO _influencer_id, _campaign_id
      FROM public.campaign_influencers ci
     WHERE ci.brief_token = _brief_token
     LIMIT 1;
  END IF;

  INSERT INTO public.contest_entries (
    contest_id, influencer_id, platform, post_url, handle,
    submitter_name, submitter_email, source, status, full_name
  )
  VALUES (
    _contest_id, _influencer_id, _platform::platform, _post_url, _handle,
    _submitter_name, _submitter_email, 'public_form', 'pending', NULLIF(_submitter_name, '')
  )
  RETURNING id INTO _entry_id;

  -- Identified creators: also register the post on the campaign so it shows up
  -- in the roster and gets picked up by the metrics refresh.
  IF _influencer_id IS NOT NULL AND _campaign_id IS NOT NULL THEN
    SELECT p.id INTO _post_id
      FROM public.posts p
     WHERE p.campaign_id = _campaign_id
       AND p.influencer_id = _influencer_id
       AND p.post_url = _post_url
     LIMIT 1;

    IF _post_id IS NULL THEN
      INSERT INTO public.posts (campaign_id, influencer_id, platform, post_url, status)
      VALUES (_campaign_id, _influencer_id, _platform::platform, _post_url, 'live')
      RETURNING id INTO _post_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('entry_id', _entry_id, 'post_id', _post_id);
END $function$;

GRANT EXECUTE ON FUNCTION public.submit_contest_entry(text, text, text, text, text, text, text) TO anon, authenticated;