CREATE OR REPLACE FUNCTION public.get_contest_filter_handles(_token text)
 RETURNS TABLE(handle text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH c AS (SELECT id FROM public.contests WHERE submission_token = _token LIMIT 1)
  SELECT DISTINCT eh.handle
  FROM public.contest_excluded_handles eh
  JOIN c ON c.id = eh.contest_id
  WHERE eh.handle IS NOT NULL AND eh.handle <> '';
$function$;