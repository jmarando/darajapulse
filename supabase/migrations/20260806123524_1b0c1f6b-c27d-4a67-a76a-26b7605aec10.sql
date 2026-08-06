CREATE OR REPLACE FUNCTION public.submit_contest_entry(_token text, _platform text, _post_url text, _handle text, _submitter_name text, _submitter_email text, _brief_token text DEFAULT NULL::text)
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
  _ci_id uuid;
  _needs_contract boolean := false;
BEGIN
  SELECT id, campaign_id INTO _contest_id, _campaign_id
    FROM public.contests WHERE submission_token = _token AND is_active LIMIT 1;
  IF _contest_id IS NULL THEN RAISE EXCEPTION 'invalid contest token'; END IF;
  IF _post_url IS NULL OR length(_post_url) < 8 THEN RAISE EXCEPTION 'post_url required'; END IF;

  IF _brief_token IS NOT NULL THEN
    SELECT ci.id, ci.influencer_id, ci.campaign_id INTO _ci_id, _influencer_id, _campaign_id
      FROM public.campaign_influencers ci
     WHERE ci.brief_token = _brief_token
     LIMIT 1;
  END IF;

  IF _campaign_id IS NOT NULL THEN
    SELECT (c.contract_template_id IS NOT NULL) INTO _needs_contract
      FROM public.campaigns c WHERE c.id = _campaign_id;
    IF COALESCE(_needs_contract, false) THEN
      IF _ci_id IS NULL THEN
        RAISE EXCEPTION 'Please submit using your personal link from your brief so we can match your signed agreement.';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.contract_signatures WHERE campaign_influencer_id = _ci_id) THEN
        RAISE EXCEPTION 'Please sign your creator agreement on your brief page before submitting posts.';
      END IF;
    END IF;
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

  RETURN jsonb_build_object('entry_id', _entry_id, 'post_id', NULL, 'pending_review', true);
END $function$;

CREATE OR REPLACE FUNCTION public.review_contest_entry(_entry_id uuid, _decision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _contest_id uuid;
  _campaign_id uuid;
  _influencer_id uuid;
  _platform platform;
  _post_url text;
  _post_id uuid;
BEGIN
  IF _decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'invalid decision'; END IF;

  SELECT e.contest_id, e.influencer_id, e.platform, e.post_url
    INTO _contest_id, _influencer_id, _platform, _post_url
    FROM public.contest_entries e WHERE e.id = _entry_id;
  IF _contest_id IS NULL THEN RAISE EXCEPTION 'entry not found'; END IF;

  IF NOT public.agency_staff_on_contest(auth.uid(), _contest_id) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  UPDATE public.contest_entries SET status = _decision WHERE id = _entry_id;

  IF _decision = 'approved' THEN
    SELECT campaign_id INTO _campaign_id FROM public.contests WHERE id = _contest_id;
    IF _campaign_id IS NOT NULL AND _influencer_id IS NOT NULL THEN
      SELECT p.id INTO _post_id FROM public.posts p
       WHERE p.campaign_id = _campaign_id AND p.influencer_id = _influencer_id AND p.post_url = _post_url
       LIMIT 1;
      IF _post_id IS NULL THEN
        INSERT INTO public.posts (campaign_id, influencer_id, platform, post_url, status)
        VALUES (_campaign_id, _influencer_id, _platform, _post_url, 'live')
        RETURNING id INTO _post_id;
      END IF;
    END IF;
  ELSE
    SELECT campaign_id INTO _campaign_id FROM public.contests WHERE id = _contest_id;
    IF _campaign_id IS NOT NULL AND _influencer_id IS NOT NULL THEN
      DELETE FROM public.posts
       WHERE campaign_id = _campaign_id AND influencer_id = _influencer_id AND post_url = _post_url;
    END IF;
  END IF;

  RETURN jsonb_build_object('entry_id', _entry_id, 'status', _decision, 'post_id', _post_id);
END $function$;

GRANT EXECUTE ON FUNCTION public.review_contest_entry(uuid, text) TO authenticated;