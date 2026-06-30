
-- Backfill: ensure every brand_owner also has agency_admin on each linked agency.
INSERT INTO public.user_roles (user_id, role, agency_id)
SELECT ur.user_id, 'agency_admin'::app_role, boa.agency_id
FROM public.user_roles ur
JOIN public.brand_org_agencies boa ON boa.brand_org_id = ur.brand_org_id
WHERE ur.role = 'brand_owner'
  AND boa.agency_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Trigger: when a brand_owner role is created, mirror agency_admin onto all linked agencies.
CREATE OR REPLACE FUNCTION public.mirror_brand_owner_to_agency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'brand_owner' AND NEW.brand_org_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role, agency_id)
    SELECT NEW.user_id, 'agency_admin'::app_role, boa.agency_id
    FROM public.brand_org_agencies boa
    WHERE boa.brand_org_id = NEW.brand_org_id AND boa.agency_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_brand_owner_to_agency ON public.user_roles;
CREATE TRIGGER trg_mirror_brand_owner_to_agency
AFTER INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.mirror_brand_owner_to_agency();

-- Trigger: when a brand_org is linked to an agency, mirror existing brand_owners.
CREATE OR REPLACE FUNCTION public.mirror_brand_org_link_to_agency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role, agency_id)
  SELECT ur.user_id, 'agency_admin'::app_role, NEW.agency_id
  FROM public.user_roles ur
  WHERE ur.role = 'brand_owner' AND ur.brand_org_id = NEW.brand_org_id
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_brand_org_link_to_agency ON public.brand_org_agencies;
CREATE TRIGGER trg_mirror_brand_org_link_to_agency
AFTER INSERT ON public.brand_org_agencies
FOR EACH ROW EXECUTE FUNCTION public.mirror_brand_org_link_to_agency();
