
ALTER TABLE public.agencies ADD COLUMN IF NOT EXISTS kra_pin text;
ALTER TABLE public.brand_orgs ADD COLUMN IF NOT EXISTS kra_pin text;

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_kind text NOT NULL CHECK (org_kind IN ('agency','brand_org')),
  org_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  amount_kes integer NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','overdue','void')),
  due_date date,
  pesapal_order_tracking_id text,
  pesapal_merchant_reference text UNIQUE,
  pesapal_redirect_url text,
  paid_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin manages invoices" ON public.invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE INDEX IF NOT EXISTS invoices_org_idx ON public.invoices(org_kind, org_id);
CREATE TRIGGER invoices_touch BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  org_kind text NOT NULL CHECK (org_kind IN ('agency','brand_org')),
  org_id uuid NOT NULL,
  amount_kes integer NOT NULL,
  method text NOT NULL CHECK (method IN ('pesapal','mpesa','bank','cash','other')),
  reference text,
  pesapal_confirmation_code text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin manages payments" ON public.payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE INDEX IF NOT EXISTS payments_org_idx ON public.payments(org_kind, org_id);
CREATE INDEX IF NOT EXISTS payments_invoice_idx ON public.payments(invoice_id);

CREATE TABLE IF NOT EXISTS public.pesapal_ipn_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_tracking_id text,
  merchant_reference text,
  notification_type text,
  raw jsonb,
  status_response jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pesapal_ipn_log TO authenticated;
GRANT ALL ON public.pesapal_ipn_log TO service_role;
ALTER TABLE public.pesapal_ipn_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin reads ipn log" ON public.pesapal_ipn_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));
