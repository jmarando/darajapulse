
CREATE TABLE public.contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid REFERENCES public.agencies(id),
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  body text NOT NULL,
  exclusivity text,
  governing_law text DEFAULT 'Republic of Kenya',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_templates TO authenticated;
GRANT ALL ON public.contract_templates TO service_role;
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency staff manage contract templates" ON public.contract_templates
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_agency_access(auth.uid(), agency_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_agency_access(auth.uid(), agency_id));
CREATE TRIGGER contract_templates_touch BEFORE UPDATE ON public.contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.campaigns ADD COLUMN contract_template_id uuid REFERENCES public.contract_templates(id);

CREATE TABLE public.contract_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_influencer_id uuid NOT NULL UNIQUE REFERENCES public.campaign_influencers(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  influencer_id uuid NOT NULL REFERENCES public.influencers(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.contract_templates(id),
  contract_text text NOT NULL,
  contract_hash text NOT NULL,
  signer_name text NOT NULL,
  signature_data_url text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.contract_signatures TO authenticated;
GRANT ALL ON public.contract_signatures TO service_role;
ALTER TABLE public.contract_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency staff view signatures" ON public.contract_signatures
  FOR SELECT TO authenticated
  USING (public.agency_staff_on_campaign(auth.uid(), campaign_id));

CREATE INDEX idx_contract_signatures_campaign ON public.contract_signatures(campaign_id);

-- Render a contract for one campaign_influencer row, substituting merge fields.
CREATE OR REPLACE FUNCTION public.render_contract(_ci_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  t record;
  txt text;
BEGIN
  SELECT ci.id, ci.fee_kes, ci.deliverables_count, c.id AS campaign_id, c.name AS campaign_name,
         c.start_date, c.end_date, c.hashtag, c.wht_percent, c.contract_template_id,
         cl.name AS client_name, i.full_name, i.handle, i.id AS influencer_id
    INTO r
    FROM public.campaign_influencers ci
    JOIN public.campaigns c ON c.id = ci.campaign_id
    JOIN public.clients cl ON cl.id = c.client_id
    JOIN public.influencers i ON i.id = ci.influencer_id
   WHERE ci.id = _ci_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO t FROM public.contract_templates ct WHERE ct.id = r.contract_template_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  txt := t.body;
  txt := replace(txt, '{{creator_name}}', COALESCE(r.full_name, ''));
  txt := replace(txt, '{{handle}}', COALESCE('@' || ltrim(r.handle, '@'), ''));
  txt := replace(txt, '{{fee}}', 'KES ' || to_char(COALESCE(r.fee_kes, 0), 'FM999,999,999'));
  txt := replace(txt, '{{deliverables}}', COALESCE(r.deliverables_count, 0)::text);
  txt := replace(txt, '{{campaign}}', COALESCE(r.campaign_name, ''));
  txt := replace(txt, '{{client}}', COALESCE(r.client_name, ''));
  txt := replace(txt, '{{hashtag}}', COALESCE(r.hashtag, ''));
  txt := replace(txt, '{{wht}}', COALESCE(r.wht_percent, 0)::text || '%');
  txt := replace(txt, '{{period}}', COALESCE(r.start_date::text, '') || ' to ' || COALESCE(r.end_date::text, ''));
  txt := replace(txt, '{{exclusivity}}', COALESCE(t.exclusivity, ''));
  txt := replace(txt, '{{governing_law}}', COALESCE(t.governing_law, 'Republic of Kenya'));
  txt := replace(txt, '{{today}}', to_char(now(), 'DD Mon YYYY'));

  RETURN jsonb_build_object(
    'template_id', t.id,
    'title', t.name,
    'text', txt,
    'hash', encode(digest(txt, 'sha256'), 'hex')
  );
END $$;

-- Public: fetch the contract (and any existing signature) via the creator's brief token.
CREATE OR REPLACE FUNCTION public.get_contract_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _ci_id uuid;
  _doc jsonb;
  _sig record;
BEGIN
  SELECT id INTO _ci_id FROM public.campaign_influencers WHERE brief_token = _token LIMIT 1;
  IF _ci_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO _sig FROM public.contract_signatures WHERE campaign_influencer_id = _ci_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'required', true,
      'signed', true,
      'title', 'Creator agreement',
      'text', _sig.contract_text,
      'signer_name', _sig.signer_name,
      'signature_data_url', _sig.signature_data_url,
      'signed_at', _sig.signed_at
    );
  END IF;

  _doc := public.render_contract(_ci_id);
  IF _doc IS NULL THEN RETURN jsonb_build_object('required', false, 'signed', false); END IF;
  RETURN _doc || jsonb_build_object('required', true, 'signed', false);
END $$;

-- Public: sign the contract via the creator's brief token. One signature, immutable.
CREATE OR REPLACE FUNCTION public.sign_contract_by_token(
  _token text, _signer_name text, _signature_data_url text DEFAULT NULL, _user_agent text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  _doc jsonb;
  _id uuid;
BEGIN
  IF _signer_name IS NULL OR length(btrim(_signer_name)) < 3 THEN
    RAISE EXCEPTION 'Please type your full legal name';
  END IF;

  SELECT ci.id, ci.campaign_id, ci.influencer_id INTO r
    FROM public.campaign_influencers ci WHERE ci.brief_token = _token LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid link'; END IF;

  IF EXISTS (SELECT 1 FROM public.contract_signatures WHERE campaign_influencer_id = r.id) THEN
    RETURN jsonb_build_object('already_signed', true);
  END IF;

  _doc := public.render_contract(r.id);
  IF _doc IS NULL THEN RAISE EXCEPTION 'no contract is attached to this campaign'; END IF;

  INSERT INTO public.contract_signatures (
    campaign_influencer_id, campaign_id, influencer_id, template_id,
    contract_text, contract_hash, signer_name, signature_data_url, ip_address, user_agent
  ) VALUES (
    r.id, r.campaign_id, r.influencer_id, (_doc->>'template_id')::uuid,
    _doc->>'text', _doc->>'hash', btrim(_signer_name), _signature_data_url,
    NULLIF(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), _user_agent
  ) RETURNING id INTO _id;

  UPDATE public.campaign_influencers SET status = 'confirmed' WHERE id = r.id AND COALESCE(status,'') <> 'declined';

  RETURN jsonb_build_object('signature_id', _id, 'signed', true);
END $$;

-- Submissions now require a signed contract when the campaign has one.
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
  _post_id uuid;
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

  -- Contract gate: if the campaign has a contract template, the creator must have signed.
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

-- Brief payload now tells the page whether a contract is attached / signed.
CREATE OR REPLACE FUNCTION public.get_brief_by_token(_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'ci_id', ci.id,
    'status', ci.status,
    'brief_token', ci.brief_token,
    'fee_kes', ci.fee_kes,
    'deliverables_count', ci.deliverables_count,
    'deliverables_breakdown', ci.deliverables_breakdown,
    'contract_required', (c.contract_template_id IS NOT NULL),
    'contract_signed', EXISTS (SELECT 1 FROM public.contract_signatures cs WHERE cs.campaign_influencer_id = ci.id),
    'submission_token', (
      SELECT ct.submission_token FROM public.contests ct
      WHERE ct.campaign_id = c.id
      ORDER BY ct.created_at ASC
      LIMIT 1
    ),
    'campaign', jsonb_build_object(
      'name', c.name,
      'brief', COALESCE(t.brief, c.brief),
      'objective', COALESCE(t.objective, c.objective),
      'hashtag', COALESCE(t.hashtag, c.hashtag),
      'start_date', c.start_date,
      'end_date', c.end_date,
      'dos', COALESCE(t.dos, c.dos),
      'donts', COALESCE(t.donts, c.donts),
      'mandatory_mentions', COALESCE(t.mandatory_mentions, c.mandatory_mentions),
      'hashtags_extra', COALESCE(t.hashtags_extra, c.hashtags_extra),
      'content_format', COALESCE(t.content_format, c.content_format),
      'tone', COALESCE(t.tone, c.tone),
      'references_urls', COALESCE(t.references_urls, c.references_urls),
      'wht_percent', COALESCE(t.wht_percent, c.wht_percent)
    ),
    'client', jsonb_build_object('name', cl.name, 'logo_url', cl.logo_url),
    'influencer', jsonb_build_object('id', i.id, 'full_name', i.full_name, 'handle', i.handle, 'primary_platform', i.primary_platform)
  )
  FROM public.campaign_influencers ci
  JOIN public.campaigns c ON c.id = ci.campaign_id
  LEFT JOIN public.brief_templates t ON t.id = c.brief_template_id
  JOIN public.clients cl ON cl.id = c.client_id
  JOIN public.influencers i ON i.id = ci.influencer_id
  WHERE ci.brief_token = _token
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_contract_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_contract_by_token(text, text, text, text) TO anon, authenticated;
