
UPDATE public.agencies SET kind = 'brand'::public.agency_kind WHERE slug = 'pakakumi';

CREATE OR REPLACE FUNCTION public.get_tenant_by_host(_host text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH sub AS (SELECT split_part(_host, '.', 1) AS s)
  SELECT COALESCE(
    (SELECT jsonb_build_object('kind','agency','agency_kind',a.kind::text,'id',a.id,'name',a.name,'slug',a.slug,
       'display_name',a.display_name,'logo_url',a.logo_url,'primary_color',a.primary_color,
       'support_email',a.support_email,'hide_powered_by',a.hide_powered_by)
     FROM public.agencies a, sub WHERE a.subdomain = sub.s AND a.is_active LIMIT 1),
    (SELECT jsonb_build_object('kind','brand_org','agency_kind','brand','id',b.id,'name',b.name,'slug',b.slug,
       'display_name',b.display_name,'logo_url',b.logo_url,'primary_color',b.primary_color,
       'support_email',b.support_email,'hide_powered_by',true)
     FROM public.brand_orgs b, sub WHERE b.subdomain = sub.s AND b.is_active LIMIT 1),
    (SELECT jsonb_build_object('kind','agency','agency_kind',a.kind::text,'id',a.id,'name',a.name,'slug',a.slug,
       'display_name',a.display_name,'logo_url',a.logo_url,'primary_color',a.primary_color,
       'support_email',a.support_email,'hide_powered_by',a.hide_powered_by)
     FROM public.agencies a WHERE a.is_default = true LIMIT 1)
  );
$function$;
