
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS require_draft_approval boolean NOT NULL DEFAULT false;

CREATE TABLE public.creator_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  campaign_influencer_id uuid REFERENCES public.campaign_influencers(id) ON DELETE SET NULL,
  influencer_id uuid REFERENCES public.influencers(id) ON DELETE SET NULL,
  file_path text NOT NULL,
  file_name text,
  mime_type text,
  file_size bigint,
  platform text,
  caption text,
  creator_note text,
  status text NOT NULL DEFAULT 'pending',
  review_note text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  reviewer_label text,
  post_url text,
  posted_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_drafts TO authenticated;
GRANT ALL ON public.creator_drafts TO service_role;
ALTER TABLE public.creator_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency staff manage campaign drafts"
ON public.creator_drafts FOR ALL TO authenticated
USING (public.agency_staff_on_campaign(auth.uid(), campaign_id))
WITH CHECK (public.agency_staff_on_campaign(auth.uid(), campaign_id));

CREATE POLICY "Client members read campaign drafts"
ON public.creator_drafts FOR SELECT TO authenticated
USING (public.user_has_campaign_access(auth.uid(), campaign_id));

CREATE INDEX idx_creator_drafts_campaign ON public.creator_drafts(campaign_id, status);
CREATE INDEX idx_creator_drafts_ci ON public.creator_drafts(campaign_influencer_id);

CREATE TRIGGER trg_creator_drafts_updated
BEFORE UPDATE ON public.creator_drafts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.draft_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT (replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')),
  label text,
  can_decide boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.draft_links TO authenticated;
GRANT ALL ON public.draft_links TO service_role;
ALTER TABLE public.draft_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency staff manage draft links"
ON public.draft_links FOR ALL TO authenticated
USING (public.agency_staff_on_campaign(auth.uid(), campaign_id))
WITH CHECK (public.agency_staff_on_campaign(auth.uid(), campaign_id));

-- Creator submits a draft using their personal brief link
CREATE OR REPLACE FUNCTION public.submit_creator_draft(
  _brief_token text,
  _file_path text,
  _file_name text,
  _mime_type text DEFAULT NULL,
  _file_size bigint DEFAULT NULL,
  _platform text DEFAULT NULL,
  _caption text DEFAULT NULL,
  _creator_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; _id uuid;
BEGIN
  SELECT ci.id, ci.campaign_id, ci.influencer_id INTO r
  FROM public.campaign_influencers ci WHERE ci.brief_token = _brief_token LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid link'; END IF;
  IF _file_path IS NULL OR length(_file_path) < 3 THEN RAISE EXCEPTION 'file required'; END IF;

  INSERT INTO public.creator_drafts (campaign_id, campaign_influencer_id, influencer_id, file_path, file_name, mime_type, file_size, platform, caption, creator_note)
  VALUES (r.campaign_id, r.id, r.influencer_id, _file_path, _file_name, _mime_type, _file_size, _platform, _caption, _creator_note)
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- Creator sees the status of their own drafts
CREATE OR REPLACE FUNCTION public.get_creator_drafts(_brief_token text)
RETURNS TABLE(id uuid, file_name text, platform text, status text, review_note text, caption text, created_at timestamptz, reviewed_at timestamptz, post_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, d.file_name, d.platform, d.status, d.review_note, d.caption, d.created_at, d.reviewed_at, d.post_url
  FROM public.creator_drafts d
  JOIN public.campaign_influencers ci ON ci.id = d.campaign_influencer_id
  WHERE ci.brief_token = _brief_token
  ORDER BY d.created_at DESC;
$$;

-- Gate live-post submissions on an approved draft when the campaign requires it
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
    SELECT (c.contract_template_id IS NOT NULL), c.require_draft_approval
      INTO _needs_contract, _needs_draft
      FROM public.campaigns c WHERE c.id = _campaign_id;

    IF COALESCE(_needs_contract, false) THEN
      IF _ci_id IS NULL THEN
        RAISE EXCEPTION 'Please submit using your personal link from your brief so we can match your signed agreement.';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.contract_signatures WHERE campaign_influencer_id = _ci_id) THEN
        RAISE EXCEPTION 'Please sign your creator agreement on your brief page before submitting posts.';
      END IF;
    END IF;

    IF COALESCE(_needs_draft, false) THEN
      IF _ci_id IS NULL THEN
        RAISE EXCEPTION 'Please submit using your personal link so we can match your approved video.';
      END IF;
      SELECT d.id INTO _draft_id
        FROM public.creator_drafts d
       WHERE d.campaign_influencer_id = _ci_id
         AND d.status = 'approved'
         AND d.post_url IS NULL
       ORDER BY d.reviewed_at NULLS LAST, d.created_at
       LIMIT 1;
      IF _draft_id IS NULL THEN
        RAISE EXCEPTION 'Upload your video for approval first — you can only share the live link once the team has approved a video.';
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

  IF _draft_id IS NOT NULL THEN
    UPDATE public.creator_drafts
       SET post_url = _post_url, posted_entry_id = _entry_id
     WHERE id = _draft_id;
  END IF;

  RETURN jsonb_build_object('entry_id', _entry_id, 'post_id', NULL, 'pending_review', true);
END $function$;
