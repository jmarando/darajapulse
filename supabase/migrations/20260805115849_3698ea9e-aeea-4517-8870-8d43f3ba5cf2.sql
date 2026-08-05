CREATE OR REPLACE FUNCTION public.get_user_access_status(_ids uuid[])
RETURNS TABLE(id uuid, invited_at timestamptz, confirmed_at timestamptz, last_sign_in_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.invited_at, u.confirmed_at, u.last_sign_in_at
  FROM auth.users u
  WHERE u.id = ANY(_ids)
    AND (
      public.is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.user_roles caller
        WHERE caller.user_id = auth.uid()
          AND caller.role IN ('agency_admin','account_manager')
          AND caller.agency_id IS NOT NULL
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_user_access_status(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_user_access_status(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_access_status(uuid[]) TO service_role;