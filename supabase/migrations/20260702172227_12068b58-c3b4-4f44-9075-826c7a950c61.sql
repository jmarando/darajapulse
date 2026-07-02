
CREATE TABLE public.billing_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_kind TEXT NOT NULL CHECK (org_kind IN ('agency','brand_org')),
  org_id UUID NOT NULL,
  name TEXT,
  email TEXT NOT NULL,
  role TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_contacts TO authenticated;
GRANT ALL ON public.billing_contacts TO service_role;

ALTER TABLE public.billing_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage billing contacts"
ON public.billing_contacts FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE INDEX billing_contacts_org_idx ON public.billing_contacts(org_kind, org_id);

CREATE TRIGGER billing_contacts_updated_at
BEFORE UPDATE ON public.billing_contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

UPDATE public.brand_orgs
SET support_email = 'finance@darajapulse.com'
WHERE id = 'c5bca915-bd9d-4f5a-9939-60a8cf985940';
