CREATE OR REPLACE FUNCTION public.get_agency_team()
RETURNS TABLE(id uuid, full_name text, email text, avatar_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.id, p.full_name, p.email, p.avatar_url
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role IN ('agency_admin','account_manager')
    AND (
      public.has_role(auth.uid(), 'agency_admin')
      OR public.has_role(auth.uid(), 'account_manager')
    );
$$;

CREATE OR REPLACE FUNCTION public.get_profiles_by_ids(_ids uuid[])
RETURNS TABLE(id uuid, full_name text, email text, avatar_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.email, p.avatar_url
  FROM public.profiles p
  WHERE p.id = ANY(_ids)
    AND (
      public.has_role(auth.uid(), 'agency_admin')
      OR public.has_role(auth.uid(), 'account_manager')
    );
$$;