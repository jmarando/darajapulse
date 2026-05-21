DROP FUNCTION public.get_profiles_by_ids(uuid[]);
CREATE FUNCTION public.get_profiles_by_ids(_ids uuid[])
RETURNS TABLE(id uuid, full_name text, email text, avatar_url text, title text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.full_name, p.email, p.avatar_url, p.title
  FROM public.profiles p
  WHERE p.id = ANY(_ids)
    AND (
      public.has_role(auth.uid(), 'agency_admin')
      OR public.has_role(auth.uid(), 'account_manager')
    );
$function$;