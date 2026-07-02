-- 1. Reassign Pakakumi (brand-kind) agency data to Daraja Pulse, then delete it
DO $$
DECLARE _pak uuid := 'fc7da573-56f2-4ece-9dc2-ca6b300d45e8';
        _dp  uuid := '4dc78aaa-e8ec-40f1-911e-72e307028b4e';
BEGIN
  UPDATE public.clients         SET agency_id=_dp WHERE agency_id=_pak;
  UPDATE public.campaigns       SET agency_id=_dp WHERE agency_id=_pak;
  UPDATE public.contests        SET agency_id=_dp WHERE agency_id=_pak;
  UPDATE public.influencers     SET agency_id=_dp WHERE agency_id=_pak;
  UPDATE public.brief_templates SET agency_id=_dp WHERE agency_id=_pak;
  -- inventory_*, user_roles, brand_org_agencies cascade on delete
  DELETE FROM public.agencies WHERE id=_pak;
END $$;

-- 2. Pakakumi brand_org invoicing details
UPDATE public.brand_orgs
SET legal_name = 'Reys and Meys Limited',
    invoice_address = 'Royal Offices, Suite 12' || E'\n' || 'Mogotio Road' || E'\n' || 'Nairobi, Kenya'
WHERE id = 'c5bca915-bd9d-4f5a-9939-60a8cf985940';

-- 3. Invoice numbering, view token, billing email
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1000;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_number text UNIQUE,
  ADD COLUMN IF NOT EXISTS view_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_invoice_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := 'INV-' || to_char(now(),'YYYY') || '-' ||
                          lpad(nextval('public.invoice_number_seq')::text, 4, '0');
  END IF;
  IF NEW.view_token IS NULL THEN
    NEW.view_token := encode(gen_random_bytes(16), 'hex');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoices_set_number ON public.invoices;
CREATE TRIGGER trg_invoices_set_number
BEFORE INSERT ON public.invoices FOR EACH ROW
EXECUTE FUNCTION public.set_invoice_number();

-- Backfill existing rows
UPDATE public.invoices
SET invoice_number = 'INV-' || to_char(created_at,'YYYY') || '-' ||
                     lpad(nextval('public.invoice_number_seq')::text, 4, '0')
WHERE invoice_number IS NULL;

UPDATE public.invoices
SET view_token = encode(gen_random_bytes(16),'hex')
WHERE view_token IS NULL;

-- 4. Suspension flags on tenant orgs
ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_reason text;

ALTER TABLE public.brand_orgs
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_reason text;

-- 5. Overdue + suspension enforcement
CREATE OR REPLACE FUNCTION public.enforce_billing_status()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.invoices
     SET status = 'overdue'
   WHERE status = 'sent'
     AND due_date IS NOT NULL
     AND due_date < CURRENT_DATE;

  UPDATE public.brand_orgs b
     SET is_suspended = true,
         suspended_at = COALESCE(suspended_at, now()),
         suspension_reason = 'Invoice overdue more than 14 days'
   WHERE NOT b.is_suspended
     AND EXISTS (
       SELECT 1 FROM public.invoices i
        WHERE i.org_kind = 'brand_org' AND i.org_id = b.id
          AND i.status = 'overdue'
          AND (i.due_date + INTERVAL '14 days')::date <= CURRENT_DATE
     );

  UPDATE public.agencies a
     SET is_suspended = true,
         suspended_at = COALESCE(suspended_at, now()),
         suspension_reason = 'Invoice overdue more than 14 days'
   WHERE NOT a.is_suspended
     AND EXISTS (
       SELECT 1 FROM public.invoices i
        WHERE i.org_kind = 'agency' AND i.org_id = a.id
          AND i.status = 'overdue'
          AND (i.due_date + INTERVAL '14 days')::date <= CURRENT_DATE
     );

  -- Un-suspend once no overdue invoices remain
  UPDATE public.brand_orgs b
     SET is_suspended = false, suspended_at = NULL, suspension_reason = NULL
   WHERE b.is_suspended
     AND NOT EXISTS (
       SELECT 1 FROM public.invoices i
        WHERE i.org_kind = 'brand_org' AND i.org_id = b.id AND i.status = 'overdue'
     );

  UPDATE public.agencies a
     SET is_suspended = false, suspended_at = NULL, suspension_reason = NULL
   WHERE a.is_suspended
     AND NOT EXISTS (
       SELECT 1 FROM public.invoices i
        WHERE i.org_kind = 'agency' AND i.org_id = a.id AND i.status = 'overdue'
     );
END $$;

GRANT EXECUTE ON FUNCTION public.enforce_billing_status() TO service_role;

-- 6. Public invoice viewer (no auth required, token-gated)
CREATE OR REPLACE FUNCTION public.get_invoice_by_token(_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', i.id,
    'invoice_number', i.invoice_number,
    'amount_kes', i.amount_kes,
    'status', i.status,
    'period_start', i.period_start,
    'period_end', i.period_end,
    'due_date', i.due_date,
    'created_at', i.created_at,
    'paid_at', i.paid_at,
    'notes', i.notes,
    'pesapal_redirect_url', i.pesapal_redirect_url,
    'org_kind', i.org_kind,
    'org', CASE WHEN i.org_kind = 'agency'
      THEN (SELECT jsonb_build_object(
              'name', a.name, 'legal_name', a.legal_name,
              'invoice_address', a.invoice_address, 'kra_pin', a.kra_pin,
              'support_email', a.support_email, 'logo_url', a.logo_url)
             FROM public.agencies a WHERE a.id = i.org_id)
      ELSE (SELECT jsonb_build_object(
              'name', b.name, 'legal_name', b.legal_name,
              'invoice_address', b.invoice_address, 'kra_pin', b.kra_pin,
              'support_email', b.support_email, 'logo_url', b.logo_url)
             FROM public.brand_orgs b WHERE b.id = i.org_id)
    END
  )
  FROM public.invoices i
  WHERE i.view_token = _token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_invoice_by_token(text) TO anon, authenticated;

-- 7. Include suspension state in tenant-by-host lookup
CREATE OR REPLACE FUNCTION public.get_tenant_by_host(_host text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH sub AS (SELECT split_part(_host, '.', 1) AS s)
  SELECT COALESCE(
    (SELECT jsonb_build_object('kind','agency','agency_kind',a.kind::text,'id',a.id,'name',a.name,'slug',a.slug,
       'display_name',a.display_name,'logo_url',a.logo_url,'primary_color',a.primary_color,
       'support_email',a.support_email,'hide_powered_by',a.hide_powered_by,
       'is_suspended',a.is_suspended,'suspension_reason',a.suspension_reason)
     FROM public.agencies a, sub WHERE a.subdomain = sub.s AND a.is_active LIMIT 1),
    (SELECT jsonb_build_object('kind','brand_org','agency_kind','brand','id',b.id,'name',b.name,'slug',b.slug,
       'display_name',b.display_name,'logo_url',b.logo_url,'primary_color',b.primary_color,
       'support_email',b.support_email,'hide_powered_by',true,
       'is_suspended',b.is_suspended,'suspension_reason',b.suspension_reason)
     FROM public.brand_orgs b, sub WHERE b.subdomain = sub.s AND b.is_active LIMIT 1),
    (SELECT jsonb_build_object('kind','agency','agency_kind',a.kind::text,'id',a.id,'name',a.name,'slug',a.slug,
       'display_name',a.display_name,'logo_url',a.logo_url,'primary_color',a.primary_color,
       'support_email',a.support_email,'hide_powered_by',a.hide_powered_by,
       'is_suspended',a.is_suspended,'suspension_reason',a.suspension_reason)
     FROM public.agencies a WHERE a.is_default = true LIMIT 1)
  );
$$;

-- 8. Daily cron
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='enforce-billing-status';
    PERFORM cron.schedule('enforce-billing-status','15 3 * * *',
      $cron$ SELECT public.enforce_billing_status(); $cron$);
  END IF;
END $$;