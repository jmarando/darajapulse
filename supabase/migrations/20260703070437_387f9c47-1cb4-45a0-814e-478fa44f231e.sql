
-- Create a brand-kind agency for Pakakumi so the brand org's owners get campaign write access via the existing mirror trigger.
DO $$
DECLARE
  _brand_org_id uuid := 'c5bca915-bd9d-4f5a-9939-60a8cf985940';
  _agency_id uuid;
BEGIN
  SELECT id INTO _agency_id FROM public.agencies WHERE subdomain = 'pakakumi' OR slug = 'pakakumi' LIMIT 1;

  IF _agency_id IS NULL THEN
    INSERT INTO public.agencies (name, slug, subdomain, kind, display_name, is_active, hide_powered_by)
    VALUES ('Pakakumi', 'pakakumi', 'pakakumi', 'brand'::agency_kind, 'Pakakumi', true, true)
    RETURNING id INTO _agency_id;
  END IF;

  -- Link brand_org to agency (mirror trigger promotes existing brand_owners to agency_admin)
  INSERT INTO public.brand_org_agencies (brand_org_id, agency_id)
  VALUES (_brand_org_id, _agency_id)
  ON CONFLICT DO NOTHING;

  -- Move Pakakumi's existing client(s) from the default agency onto the new brand agency
  UPDATE public.clients
     SET agency_id = _agency_id
   WHERE name = 'Pakakumi'
     AND agency_id = (SELECT id FROM public.agencies WHERE is_default LIMIT 1);

  -- Belt-and-suspenders: ensure the three Pakakumi brand_owners have the mirrored agency_admin role
  INSERT INTO public.user_roles (user_id, role, agency_id)
  SELECT ur.user_id, 'agency_admin'::app_role, _agency_id
  FROM public.user_roles ur
  WHERE ur.brand_org_id = _brand_org_id AND ur.role = 'brand_owner'
  ON CONFLICT DO NOTHING;
END $$;
