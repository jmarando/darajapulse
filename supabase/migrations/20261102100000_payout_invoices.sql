-- Invoices for creator payouts: which eTIMS invoice backs each payout, and where it stands.
--
-- Why: every creator payment needs an eTIMS invoice made out to the paying company. The Royco contract pays 45 days
-- after the final invoice and the creator's report are approved, and KRA has checked declared expenses against eTIMS
-- invoices since January 2026. The app knows nothing about invoices today, so the rule lives in WhatsApp and Drive.
-- See CREATOR_PAYOUTS_DESIGN.md (Stage 2 of CREATOR_PAYOUTS_PLAN.md).
--
-- What:
--   * payouts gains the invoice route (KRA Buyer Initiated Invoicing, or the creator's own invoice), its status, number,
--     dates and uploaded file, and report_approved_at: the date the creator's campaign report was approved. Finalising a
--     creator's figure counts as approving their report, so existing rows are backfilled with their finalise date and new
--     rows default to now(). Check constraints keep the route and status consistent.
--   * A trigger locks gross_kes, wht_kes, net_kes and the invoice route while an invoice is raised or approved: the KRA
--     invoice carries that amount, and a payout must never have two invoices. A declined or expired invoice can be raised
--     again, by either route.
--   * campaigns.payment_terms_days: days after both approvals that a creator becomes payable (Royco: 45). Set per
--     campaign in the app; this migration sets no values.
--   * A private storage bucket for invoices that creators issued themselves. Files live at <agency_id>/<payout_id>/<file>
--     and only staff of that agency (or a super admin) can read, add or delete them. The agency is read from the path by
--     a function that returns NULL for anything that isn't a uuid, so objects in other buckets can never make a policy fail.
--   * get_payout_card_by_token now also returns the creator's payout and invoice state. Every other key and mask is as in
--     20261031100000_creator_payout_details.sql.
--
-- Needs 20261031100000_creator_payout_details.sql first. Checked with supabase/verify/payout_invoices.sql inside a
-- rolled-back DO block.
--
-- To roll back:
--   DROP POLICY IF EXISTS "Agency staff read payout invoices" ON storage.objects;
--   DROP POLICY IF EXISTS "Agency staff upload payout invoices" ON storage.objects;
--   DROP POLICY IF EXISTS "Agency staff delete payout invoices" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'payout-invoices';   -- after emptying it
--   DROP FUNCTION IF EXISTS public.payout_invoice_agency(text);
--   ALTER TABLE public.campaigns DROP COLUMN payment_terms_days;
--   DROP TRIGGER IF EXISTS payouts_invoice_guard ON public.payouts;
--   DROP FUNCTION IF EXISTS public.payouts_invoice_guard();
--   ALTER TABLE public.payouts DROP CONSTRAINT payouts_invoice_consistent, DROP COLUMN invoice_route, DROP COLUMN invoice_status,
--     DROP COLUMN invoice_number, DROP COLUMN invoice_raised_at, DROP COLUMN invoice_decided_at, DROP COLUMN invoice_file_path,
--     DROP COLUMN report_approved_at;
--   and re-create get_payout_card_by_token from 20261031100000_creator_payout_details.sql.

ALTER TABLE public.payouts
  ADD COLUMN invoice_route text CHECK (invoice_route IN ('bii', 'creator')),
  ADD COLUMN invoice_status text NOT NULL DEFAULT 'not_raised'
    CHECK (invoice_status IN ('not_raised', 'raised', 'approved', 'declined', 'expired')),
  ADD COLUMN invoice_number text,
  ADD COLUMN invoice_raised_at timestamptz,
  ADD COLUMN invoice_decided_at timestamptz,
  ADD COLUMN invoice_file_path text,
  ADD COLUMN report_approved_at timestamptz;

UPDATE public.payouts SET report_approved_at = created_at;
ALTER TABLE public.payouts
  ALTER COLUMN report_approved_at SET DEFAULT now(),
  ALTER COLUMN report_approved_at SET NOT NULL;

ALTER TABLE public.payouts ADD CONSTRAINT payouts_invoice_consistent CHECK (
  (invoice_status = 'not_raised') = (invoice_route IS NULL)
  AND (invoice_status <> 'raised' OR invoice_raised_at IS NOT NULL)
  AND (invoice_status <> 'approved' OR (invoice_number IS NOT NULL AND invoice_decided_at IS NOT NULL))
  AND (invoice_status NOT IN ('declined', 'expired') OR invoice_decided_at IS NOT NULL)
);

CREATE OR REPLACE FUNCTION public.payouts_invoice_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.invoice_status IN ('raised', 'approved') THEN
    IF NEW.gross_kes IS DISTINCT FROM OLD.gross_kes
       OR NEW.wht_kes IS DISTINCT FROM OLD.wht_kes
       OR NEW.net_kes IS DISTINCT FROM OLD.net_kes THEN
      RAISE EXCEPTION 'The amount is locked while an invoice is raised or approved';
    END IF;
    IF NEW.invoice_route IS DISTINCT FROM OLD.invoice_route THEN
      RAISE EXCEPTION 'The invoice route is locked while an invoice is raised or approved';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER payouts_invoice_guard
BEFORE UPDATE ON public.payouts
FOR EACH ROW EXECUTE FUNCTION public.payouts_invoice_guard();

ALTER TABLE public.campaigns
  ADD COLUMN payment_terms_days integer CHECK (payment_terms_days IS NULL OR payment_terms_days BETWEEN 0 AND 365);

CREATE OR REPLACE FUNCTION public.payout_invoice_agency(_object_name text)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN split_part(_object_name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN split_part(_object_name, '/', 1)::uuid
  END
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payout-invoices', 'payout-invoices', false, 10485760, ARRAY['application/pdf', 'image/png', 'image/jpeg'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Agency staff read payout invoices" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payout-invoices' AND public.agency_staff_on_agency(auth.uid(), public.payout_invoice_agency(name)));
CREATE POLICY "Agency staff upload payout invoices" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payout-invoices' AND public.agency_staff_on_agency(auth.uid(), public.payout_invoice_agency(name)));
CREATE POLICY "Agency staff delete payout invoices" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'payout-invoices' AND public.agency_staff_on_agency(auth.uid(), public.payout_invoice_agency(name)));

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
    'payout', CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
      'status', p.status,
      'gross_kes', p.gross_kes,
      'net_kes', p.net_kes,
      'invoice_route', p.invoice_route,
      'invoice_status', p.invoice_status,
      'invoice_raised_at', p.invoice_raised_at,
      'invoice_decided_at', p.invoice_decided_at,
      'report_approved_at', p.report_approved_at,
      'payment_terms_days', c.payment_terms_days
    ) END
  )
  FROM public.campaign_influencers ci
  JOIN public.campaigns c ON c.id = ci.campaign_id
  LEFT JOIN public.creator_payout_details d ON d.agency_id = c.agency_id AND d.influencer_id = ci.influencer_id
  LEFT JOIN public.payouts p ON p.campaign_id = ci.campaign_id AND p.influencer_id = ci.influencer_id
  WHERE ci.brief_token = _token
$$;
