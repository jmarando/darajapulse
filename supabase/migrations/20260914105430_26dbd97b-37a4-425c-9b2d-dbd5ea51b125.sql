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
  _needs_draft boolean := false;
  _draft_id uuid;
  _has_approved boolean := false;
  _post_id uuid;
  _status text := 'pending';
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

  -- Fall back to matching the creator on the campaign roster by email or handle
  -- so a creator using the general link is not locked out.
  IF _ci_id IS NULL AND _campaign_id IS NOT NULL THEN
    SELECT ci.id, ci.influencer_id INTO _ci_id, _influencer_id
      FROM public.campaign_influencers ci
      JOIN public.influencers i ON i.id = ci.influencer_id
     WHERE ci.campaign_id = _campaign_id
       AND (
         (NULLIF(btrim(_submitter_email), '') IS NOT NULL AND lower(i.email) = lower(btrim(_submitter_email)))
         OR (NULLIF(btrim(_handle), '') IS NOT NULL
             AND lower(regexp_replace(coalesce(i.handle,''), '^@', '')) = lower(regexp_replace(btrim(_handle), '^@', '')))
       )
     LIMIT 1;
  END IF;

  IF _campaign_id IS NOT NULL THEN
    SELECT (c.contract_template_id IS NOT NULL), c.require_draft_approval
      INTO _needs_contract, _needs_draft
      FROM public.campaigns c WHERE c.id = _campaign_id;

    IF COALESCE(_needs_contract, false) THEN
      IF _ci_id IS NULL THEN
        RAISE EXCEPTION 'We could not match you to this campaign. Please open the personal submission link from your brief email.';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.contract_signatures WHERE campaign_influencer_id = _ci_id) THEN
        RAISE EXCEPTION 'Please sign your creator agreement on your brief page before submitting posts.';
      END IF;
    END IF;

    IF COALESCE(_needs_draft, false) THEN
      IF _ci_id IS NULL THEN
        RAISE EXCEPTION 'We could not match you to this campaign. Please open the personal submission link from your brief email.';
      END IF;
      -- Prefer an approved video that has not been linked yet, but do not block
      -- creators who posted more content than they uploaded for approval.
      SELECT d.id INTO _draft_id
        FROM public.creator_drafts d
       WHERE d.campaign_influencer_id = _ci_id
         AND d.status = 'approved'
         AND d.post_url IS NULL
       ORDER BY d.reviewed_at NULLS LAST, d.created_at
       LIMIT 1;

      SELECT EXISTS (
        SELECT 1 FROM public.creator_drafts d
         WHERE d.campaign_influencer_id = _ci_id AND d.status = 'approved'
      ) INTO _has_approved;

      IF _draft_id IS NULL AND NOT _has_approved THEN
        RAISE EXCEPTION 'Upload your video for approval first — you can only share the live link once the team has approved a video.';
      END IF;
      -- The team already approved this creator's video, so the live link goes
      -- straight onto the campaign instead of waiting in a second queue.
      IF _has_approved THEN _status := 'approved'; END IF;
    END IF;
  END IF;

  INSERT INTO public.contest_entries (
    contest_id, influencer_id, platform, post_url, handle,
    submitter_name, submitter_email, source, status, full_name
  )
  VALUES (
    _contest_id, _influencer_id, _platform::platform, _post_url, _handle,
    _submitter_name, _submitter_email, 'public_form', _status, NULLIF(_submitter_name, '')
  )
  RETURNING id INTO _entry_id;

  IF _draft_id IS NOT NULL THEN
    UPDATE public.creator_drafts
       SET post_url = _post_url, posted_entry_id = _entry_id
     WHERE id = _draft_id;
  END IF;

  IF _status = 'approved' AND _campaign_id IS NOT NULL AND _influencer_id IS NOT NULL THEN
    SELECT p.id INTO _post_id FROM public.posts p
     WHERE p.campaign_id = _campaign_id AND p.influencer_id = _influencer_id AND p.post_url = _post_url
     LIMIT 1;
    IF _post_id IS NULL THEN
      INSERT INTO public.posts (campaign_id, influencer_id, platform, post_url, status)
      VALUES (_campaign_id, _influencer_id, _platform::platform, _post_url, 'live')
      RETURNING id INTO _post_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('entry_id', _entry_id, 'post_id', _post_id, 'pending_review', _status = 'pending');
END $function$;

-- Clear the backlog: approve waiting submissions from known creators and add
-- them to the campaign video list.
WITH pend AS (
  SELECT e.id, e.influencer_id, e.platform, e.post_url, c.campaign_id
    FROM public.contest_entries e
    JOIN public.contests c ON c.id = e.contest_id
   WHERE e.status = 'pending' AND e.influencer_id IS NOT NULL AND c.campaign_id IS NOT NULL
), ins AS (
  INSERT INTO public.posts (campaign_id, influencer_id, platform, post_url, status)
  SELECT p.campaign_id, p.influencer_id, p.platform, p.post_url, 'live'
    FROM pend p
   WHERE NOT EXISTS (
     SELECT 1 FROM public.posts x
      WHERE x.campaign_id = p.campaign_id AND x.influencer_id = p.influencer_id AND x.post_url = p.post_url
   )
  RETURNING id
)
UPDATE public.contest_entries e SET status = 'approved'
  FROM pend p WHERE e.id = p.id;