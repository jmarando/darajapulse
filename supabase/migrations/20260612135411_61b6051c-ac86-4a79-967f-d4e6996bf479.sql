DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    agency_id IS NOT NULL
    AND public.has_role(auth.uid(), 'agency_admin')
    AND public.user_has_agency_access(auth.uid(), agency_id)
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    agency_id IS NOT NULL
    AND public.has_role(auth.uid(), 'agency_admin')
    AND public.user_has_agency_access(auth.uid(), agency_id)
  )
);

DROP POLICY IF EXISTS "Users see own roles" ON public.user_roles;
CREATE POLICY "Users see own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_super_admin(auth.uid())
  OR (
    agency_id IS NOT NULL
    AND public.user_has_agency_access(auth.uid(), agency_id)
  )
  OR (
    brand_org_id IS NOT NULL
    AND public.user_has_brand_org_access(auth.uid(), brand_org_id)
  )
);