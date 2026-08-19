CREATE OR REPLACE FUNCTION public.get_my_workspace_subdomain()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT a.subdomain FROM public.user_roles ur
       JOIN public.agencies a ON a.id = ur.agency_id
      WHERE ur.user_id = auth.uid()
        AND ur.role <> 'super_admin'
        AND a.is_active AND COALESCE(a.is_default,false) = false
        AND a.subdomain IS NOT NULL AND a.subdomain <> ''
      LIMIT 1),
    (SELECT b.subdomain FROM public.user_roles ur
       JOIN public.brand_orgs b ON b.id = ur.brand_org_id
      WHERE ur.user_id = auth.uid()
        AND ur.role <> 'super_admin'
        AND b.is_active
        AND b.subdomain IS NOT NULL AND b.subdomain <> ''
      LIMIT 1)
  )
  WHERE NOT EXISTS (SELECT 1 FROM public.user_roles s WHERE s.user_id = auth.uid() AND s.role = 'super_admin');
$$;
GRANT EXECUTE ON FUNCTION public.get_my_workspace_subdomain() TO authenticated;