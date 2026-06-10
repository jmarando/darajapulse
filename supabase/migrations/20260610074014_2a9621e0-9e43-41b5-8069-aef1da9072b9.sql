
-- ============================================================
-- PHASE 1b: Tenancy tables + branding + scoping
-- ============================================================

CREATE TABLE public.agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  subdomain text UNIQUE,
  display_name text,
  logo_url text,
  primary_color text DEFAULT '#EF4444',
  support_email text,
  legal_name text,
  kra_pin text,
  invoice_address text,
  hide_powered_by boolean NOT NULL DEFAULT false,
  max_seats integer NOT NULL DEFAULT 5,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agencies TO authenticated;
GRANT SELECT ON public.agencies TO anon;
GRANT ALL ON public.agencies TO service_role;
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.brand_orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  subdomain text UNIQUE,
  display_name text,
  logo_url text,
  primary_color text DEFAULT '#EF4444',
  support_email text,
  legal_name text,
  kra_pin text,
  invoice_address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_orgs TO authenticated;
GRANT SELECT ON public.brand_orgs TO anon;
GRANT ALL ON public.brand_orgs TO service_role;
ALTER TABLE public.brand_orgs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.brand_org_agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_org_id uuid NOT NULL REFERENCES public.brand_orgs(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_org_id, agency_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_org_agencies TO authenticated;
GRANT ALL ON public.brand_org_agencies TO service_role;
ALTER TABLE public.brand_org_agencies ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES public.agencies(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS brand_org_id uuid REFERENCES public.brand_orgs(id) ON DELETE CASCADE;

INSERT INTO public.agencies (name, slug, display_name, is_default, primary_color)
VALUES ('Daraja Pulse', 'daraja-pulse', 'Daraja Pulse', true, '#EF4444');

ALTER TABLE public.clients         ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES public.agencies(id) ON DELETE RESTRICT;
ALTER TABLE public.campaigns       ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES public.agencies(id) ON DELETE RESTRICT;
ALTER TABLE public.contests        ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES public.agencies(id) ON DELETE RESTRICT;
ALTER TABLE public.influencers     ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES public.agencies(id) ON DELETE RESTRICT;
ALTER TABLE public.brief_templates ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.clients         SET agency_id = (SELECT id FROM public.agencies WHERE is_default LIMIT 1) WHERE agency_id IS NULL;
UPDATE public.campaigns       SET agency_id = (SELECT id FROM public.agencies WHERE is_default LIMIT 1) WHERE agency_id IS NULL;
UPDATE public.contests        SET agency_id = (SELECT id FROM public.agencies WHERE is_default LIMIT 1) WHERE agency_id IS NULL;
UPDATE public.influencers     SET agency_id = (SELECT id FROM public.agencies WHERE is_default LIMIT 1) WHERE agency_id IS NULL;
UPDATE public.brief_templates SET agency_id = (SELECT id FROM public.agencies WHERE is_default LIMIT 1) WHERE agency_id IS NULL;

UPDATE public.user_roles SET agency_id = (SELECT id FROM public.agencies WHERE is_default LIMIT 1)
WHERE role IN ('agency_admin','account_manager') AND agency_id IS NULL;

ALTER TABLE public.clients   ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE public.campaigns ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE public.contests  ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE public.influencers ALTER COLUMN agency_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.user_has_agency_access(_user_id uuid, _agency_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND agency_id = _agency_id
      AND role IN ('agency_admin','account_manager')
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_brand_org_access(_user_id uuid, _brand_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND brand_org_id = _brand_org_id
      AND role IN ('brand_owner','brand_viewer')
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_by_host(_host text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH sub AS (SELECT split_part(_host, '.', 1) AS s)
  SELECT COALESCE(
    (SELECT jsonb_build_object('kind','agency','id',a.id,'name',a.name,'slug',a.slug,
       'display_name',a.display_name,'logo_url',a.logo_url,'primary_color',a.primary_color,
       'support_email',a.support_email,'hide_powered_by',a.hide_powered_by)
     FROM public.agencies a, sub WHERE a.subdomain = sub.s AND a.is_active LIMIT 1),
    (SELECT jsonb_build_object('kind','brand_org','id',b.id,'name',b.name,'slug',b.slug,
       'display_name',b.display_name,'logo_url',b.logo_url,'primary_color',b.primary_color,
       'support_email',b.support_email,'hide_powered_by',true)
     FROM public.brand_orgs b, sub WHERE b.subdomain = sub.s AND b.is_active LIMIT 1),
    (SELECT jsonb_build_object('kind','agency','id',a.id,'name',a.name,'slug',a.slug,
       'display_name',a.display_name,'logo_url',a.logo_url,'primary_color',a.primary_color,
       'support_email',a.support_email,'hide_powered_by',a.hide_powered_by)
     FROM public.agencies a WHERE a.is_default = true LIMIT 1)
  );
$$;

CREATE POLICY "Agency members read own agency" ON public.agencies FOR SELECT TO authenticated
  USING (public.user_has_agency_access(auth.uid(), id) OR is_default);
CREATE POLICY "Agency admins update own agency" ON public.agencies FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND agency_id=agencies.id AND role='agency_admin'));
CREATE POLICY "Super admin all agencies" ON public.agencies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "Public can read agency branding" ON public.agencies FOR SELECT TO anon USING (true);

CREATE POLICY "Brand members read own org" ON public.brand_orgs FOR SELECT TO authenticated
  USING (public.user_has_brand_org_access(auth.uid(), id));
CREATE POLICY "Brand owner updates own org" ON public.brand_orgs FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND brand_org_id=brand_orgs.id AND role='brand_owner'));
CREATE POLICY "Public can read brand org branding" ON public.brand_orgs FOR SELECT TO anon USING (true);

CREATE POLICY "Brand org members see agency links" ON public.brand_org_agencies FOR SELECT TO authenticated
  USING (public.user_has_brand_org_access(auth.uid(), brand_org_id) OR public.user_has_agency_access(auth.uid(), agency_id));
CREATE POLICY "Brand owner manages agency links" ON public.brand_org_agencies FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND brand_org_id=brand_org_agencies.brand_org_id AND role='brand_owner'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND brand_org_id=brand_org_agencies.brand_org_id AND role='brand_owner'));

CREATE TRIGGER trg_agencies_updated   BEFORE UPDATE ON public.agencies   FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_brand_orgs_updated BEFORE UPDATE ON public.brand_orgs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
