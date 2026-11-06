-- Creators' payout details: the M-Pesa line to pay and the KRA identity their eTIMS invoice is raised under.
--
-- Why: creators are paid by hand today, and nothing in the database says which M-Pesa number to pay.
-- influencers.phone_mpesa is labelled "Phone (WhatsApp)" in the app, and no KRA PIN or ID number is
-- stored for any creator. KRA's Buyer Initiated Invoicing batch upload identifies a seller by the name
-- on their ID, their ID number and phone, so those are needed before an invoice can be raised for them.
-- See CREATOR_PAYOUTS_DESIGN.md (Stage 1 of CREATOR_PAYOUTS_PLAN.md).
--
-- What:
--   * agency_staff_on_agency(user, agency): super admin, or agency_admin/account_manager of that agency.
--   * creator_payout_details: one row per (agency, creator). It is agency-scoped, not on the shared
--     influencers row, so ID numbers and PINs never cross agencies. Formats are checked by the table.
--     anon has no access; authenticated users only through agency_staff_on_agency.
--   * creator_payout_detail_events: one row per update, naming the columns that changed.
--   * A trigger records who changed a row: a signed-in user is "staff", no user (the creator's link) is
--     "creator". Changing mpesa_number stamps mpesa_changed_at and who changed it, so a payment run
--     can flag a number that changed after the figure was agreed.
--   * get_payout_card_by_token / save_payout_details_by_token: the creator's own page (/b/:token)
--     reads and saves through these. They need a signed agreement, and only masked PIN, ID and
--     number ever leave the database.
--
-- Checked with supabase/verify/payout_details.sql inside a rolled-back DO block.
--
-- To roll back:
--   DROP FUNCTION IF EXISTS public.save_payout_details_by_token(text, jsonb);
--   DROP FUNCTION IF EXISTS public.get_payout_card_by_token(text);
--   DROP TABLE IF EXISTS public.creator_payout_detail_events;
--   DROP TABLE IF EXISTS public.creator_payout_details;
--   DROP FUNCTION IF EXISTS public.creator_payout_details_track();
--   DROP FUNCTION IF EXISTS public.agency_staff_on_agency(uuid, uuid);

CREATE OR REPLACE FUNCTION public.agency_staff_on_agency(_user_id uuid, _agency_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.agency_id = _agency_id
      AND ur.role IN ('agency_admin','account_manager')
  )
$$;

CREATE TABLE public.creator_payout_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  influencer_id uuid NOT NULL REFERENCES public.influencers(id) ON DELETE CASCADE,
  mpesa_number text NOT NULL CHECK (mpesa_number ~ '^254[71][0-9]{8}$'),
  mpesa_name text NOT NULL,
  kra_pin text NOT NULL CHECK (kra_pin ~ '^A[0-9]{9}[A-Z]$'),
  legal_name text NOT NULL,
  id_number text NOT NULL CHECK (id_number ~ '^[0-9]{7,8}$'),
  vat_registered boolean NOT NULL DEFAULT false,
  bii_consent_at timestamptz,
  confirmed_at timestamptz,
  last_changed_by uuid,
  last_changed_by_kind text NOT NULL CHECK (last_changed_by_kind IN ('creator','staff')),
  mpesa_changed_at timestamptz,
  mpesa_changed_by_kind text CHECK (mpesa_changed_by_kind IN ('creator','staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, influencer_id)
);

CREATE TABLE public.creator_payout_detail_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  details_id uuid NOT NULL REFERENCES public.creator_payout_details(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid,
  changed_by_kind text NOT NULL CHECK (changed_by_kind IN ('creator','staff')),
  fields text[] NOT NULL
);
CREATE INDEX creator_payout_detail_events_details_idx ON public.creator_payout_detail_events (details_id, changed_at DESC);

ALTER TABLE public.creator_payout_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_payout_detail_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency staff manage payout details" ON public.creator_payout_details
  FOR ALL TO authenticated
  USING (public.agency_staff_on_agency(auth.uid(), agency_id))
  WITH CHECK (public.agency_staff_on_agency(auth.uid(), agency_id));

CREATE POLICY "Agency staff read payout detail events" ON public.creator_payout_detail_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.creator_payout_details d
                 WHERE d.id = details_id AND public.agency_staff_on_agency(auth.uid(), d.agency_id)));

REVOKE ALL ON public.creator_payout_details FROM anon;
REVOKE ALL ON public.creator_payout_detail_events FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_payout_details TO authenticated;
GRANT SELECT ON public.creator_payout_detail_events TO authenticated;
GRANT ALL ON public.creator_payout_details TO service_role;
GRANT ALL ON public.creator_payout_detail_events TO service_role;

CREATE OR REPLACE FUNCTION public.creator_payout_details_track()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _kind text := CASE WHEN auth.uid() IS NULL THEN 'creator' ELSE 'staff' END;
  _fields text[] := '{}';
BEGIN
  NEW.updated_at := now();
  NEW.last_changed_by := _uid;
  NEW.last_changed_by_kind := _kind;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.mpesa_number IS DISTINCT FROM OLD.mpesa_number THEN
      NEW.mpesa_changed_at := now();
      NEW.mpesa_changed_by_kind := _kind;
      _fields := array_append(_fields, 'mpesa_number');
    END IF;
    IF NEW.mpesa_name IS DISTINCT FROM OLD.mpesa_name THEN _fields := array_append(_fields, 'mpesa_name'); END IF;
    IF NEW.kra_pin IS DISTINCT FROM OLD.kra_pin THEN _fields := array_append(_fields, 'kra_pin'); END IF;
    IF NEW.legal_name IS DISTINCT FROM OLD.legal_name THEN _fields := array_append(_fields, 'legal_name'); END IF;
    IF NEW.id_number IS DISTINCT FROM OLD.id_number THEN _fields := array_append(_fields, 'id_number'); END IF;
    IF NEW.vat_registered IS DISTINCT FROM OLD.vat_registered THEN _fields := array_append(_fields, 'vat_registered'); END IF;
    IF NEW.bii_consent_at IS DISTINCT FROM OLD.bii_consent_at THEN _fields := array_append(_fields, 'bii_consent_at'); END IF;
    IF NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at THEN _fields := array_append(_fields, 'confirmed_at'); END IF;
    IF cardinality(_fields) > 0 THEN
      INSERT INTO public.creator_payout_detail_events (details_id, changed_by, changed_by_kind, fields)
      VALUES (NEW.id, _uid, _kind, _fields);
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER creator_payout_details_track
BEFORE INSERT OR UPDATE ON public.creator_payout_details
FOR EACH ROW EXECUTE FUNCTION public.creator_payout_details_track();

CREATE OR REPLACE FUNCTION public.get_payout_card_by_token(_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'contract_signed', EXISTS (SELECT 1 FROM public.contract_signatures cs WHERE cs.campaign_influencer_id = ci.id),
    'details', CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object(
      'mpesa_number_masked', '0' || substr(d.mpesa_number, 4, 1) || '••• ••• ' || right(d.mpesa_number, 3),
      'mpesa_name', d.mpesa_name,
      'kra_pin_masked', left(d.kra_pin, 1) || '••••••' || right(d.kra_pin, 4),
      'legal_name', d.legal_name,
      'id_number_masked', repeat('•', length(d.id_number) - 4) || right(d.id_number, 4),
      'vat_registered', d.vat_registered,
      'bii_consent', d.bii_consent_at IS NOT NULL,
      'confirmed_at', d.confirmed_at
    ) END,
    'payout', NULL
  )
  FROM public.campaign_influencers ci
  JOIN public.campaigns c ON c.id = ci.campaign_id
  LEFT JOIN public.creator_payout_details d ON d.agency_id = c.agency_id AND d.influencer_id = ci.influencer_id
  WHERE ci.brief_token = _token
$$;

CREATE OR REPLACE FUNCTION public.save_payout_details_by_token(_token text, _details jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ci_id uuid;
  _campaign_id uuid;
  _influencer_id uuid;
  _agency_id uuid;
  _mpesa text := btrim(coalesce(_details->>'mpesa_number', ''));
  _mpesa_name text := btrim(regexp_replace(coalesce(_details->>'mpesa_name', ''), '\s+', ' ', 'g'));
  _pin text := upper(btrim(coalesce(_details->>'kra_pin', '')));
  _legal text := btrim(regexp_replace(coalesce(_details->>'legal_name', ''), '\s+', ' ', 'g'));
  _id text := btrim(coalesce(_details->>'id_number', ''));
  _vat boolean := coalesce((_details->>'vat_registered')::boolean, false);
  _consent boolean := coalesce((_details->>'bii_consent')::boolean, false);
BEGIN
  SELECT ci.id, ci.campaign_id, ci.influencer_id INTO _ci_id, _campaign_id, _influencer_id
  FROM public.campaign_influencers ci WHERE ci.brief_token = _token;
  IF _ci_id IS NULL THEN RAISE EXCEPTION 'Invalid link'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contract_signatures cs WHERE cs.campaign_influencer_id = _ci_id) THEN
    RAISE EXCEPTION 'Sign your agreement first';
  END IF;
  IF _mpesa !~ '^254[71][0-9]{8}$' THEN RAISE EXCEPTION 'Invalid mpesa_number'; END IF;
  IF _mpesa_name = '' THEN RAISE EXCEPTION 'Invalid mpesa_name'; END IF;
  IF _pin !~ '^A[0-9]{9}[A-Z]$' THEN RAISE EXCEPTION 'Invalid kra_pin'; END IF;
  IF _legal !~ '^\S+( \S+)+$' THEN RAISE EXCEPTION 'Invalid legal_name'; END IF;
  IF _id !~ '^[0-9]{7,8}$' THEN RAISE EXCEPTION 'Invalid id_number'; END IF;
  IF NOT _vat AND NOT _consent THEN RAISE EXCEPTION 'Consent is required'; END IF;

  SELECT c.agency_id INTO _agency_id FROM public.campaigns c WHERE c.id = _campaign_id;
  INSERT INTO public.creator_payout_details
    (agency_id, influencer_id, mpesa_number, mpesa_name, kra_pin, legal_name, id_number, vat_registered, bii_consent_at, confirmed_at)
  VALUES
    (_agency_id, _influencer_id, _mpesa, _mpesa_name, _pin, _legal, _id, _vat,
     CASE WHEN _consent AND NOT _vat THEN now() END, now())
  ON CONFLICT (agency_id, influencer_id) DO UPDATE SET
    mpesa_number = EXCLUDED.mpesa_number,
    mpesa_name = EXCLUDED.mpesa_name,
    kra_pin = EXCLUDED.kra_pin,
    legal_name = EXCLUDED.legal_name,
    id_number = EXCLUDED.id_number,
    vat_registered = EXCLUDED.vat_registered,
    bii_consent_at = EXCLUDED.bii_consent_at,
    confirmed_at = EXCLUDED.confirmed_at;

  RETURN public.get_payout_card_by_token(_token);
END $$;

REVOKE ALL ON FUNCTION public.get_payout_card_by_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_payout_details_by_token(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_payout_card_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_payout_details_by_token(text, jsonb) TO anon, authenticated;
