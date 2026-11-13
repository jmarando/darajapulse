-- Storefront channel insights: what each listed account's latest public posts say a buyer can expect.
--
-- Why: a storefront listing showed a follower count and nothing else. Buyers asked what a post there actually gets.
--
-- What:
--   * inventory_item_insights: one row per listing, written by the inventory-insights function with the service role.
--     insights holds the account's name and photo, a summary (typical views per post, posts a week, engagement), the
--     latest twelve posts for a chart and the three best with pictures. A failed read only sets last_attempt_at and
--     last_error, so an old reading stays until a good one replaces it. RLS on, no policies: nobody reads the table
--     directly, the two functions below hand out what the storefront may show.
--   * get_public_storefront: each item also carries insights_summary, the small summary only.
--   * get_public_listing_insights: one active listing's full reading, loaded when a buyer opens it.
--   * An internal_job_keys row named inventory-insights (the key comes from the table's default; the cron job presents
--     it, never read it out of a query's output) and cron job inventory-insights-twice-daily at 01:20 and 13:20 UTC.
--     A run reads at most 40 accounts not read for seven days, held to 110 seconds, and stops below 300 credits.
--
-- To roll back:
--   SELECT cron.unschedule('inventory-insights-twice-daily');
--   DELETE FROM public.internal_job_keys WHERE name = 'inventory-insights';
--   DROP FUNCTION IF EXISTS public.get_public_listing_insights(uuid);
--   DROP TABLE IF EXISTS public.inventory_item_insights;
--   and re-create get_public_storefront from 20260722152554 (the same function without insights_summary).

CREATE TABLE IF NOT EXISTS public.inventory_item_insights (
  item_id uuid PRIMARY KEY REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  insights jsonb,
  read_at timestamptz,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text
);
ALTER TABLE public.inventory_item_insights ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_public_storefront(_agency_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'agency', jsonb_build_object(
      'id', a.id, 'name', a.name, 'slug', a.slug,
      'display_name', a.display_name, 'logo_url', a.logo_url,
      'primary_color', a.primary_color, 'support_email', a.support_email
    ),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'kind', i.kind, 'title', i.title, 'subtitle', i.subtitle,
        'description', i.description, 'platform', i.platform, 'handle', i.handle,
        'cover_url', i.cover_url, 'follower_count', i.follower_count,
        'engagement_rate', i.engagement_rate, 'audience_demo', i.audience_demo,
        'demo_source', i.demo_source,
        'deliverable_type', i.deliverable_type, 'turnaround_days', i.turnaround_days,
        'revisions', i.revisions, 'tags', i.tags,
        'insights_summary', x.insights->'summary'
      ) ORDER BY i.sort_order, i.title)
      FROM public.inventory_items i
      LEFT JOIN public.inventory_item_insights x ON x.item_id = i.id
      WHERE i.agency_id = a.id AND i.is_active
    ), '[]'::jsonb)
  )
  FROM public.agencies a
  WHERE lower(a.slug) = lower(_agency_slug) AND a.is_active
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_storefront(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_listing_insights(_item_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT x.insights
  FROM public.inventory_item_insights x
  JOIN public.inventory_items i ON i.id = x.item_id
  JOIN public.agencies a ON a.id = i.agency_id
  WHERE x.item_id = _item_id AND i.is_active AND a.is_active
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_listing_insights(uuid) TO anon, authenticated;

INSERT INTO public.internal_job_keys(name) VALUES ('inventory-insights') ON CONFLICT (name) DO NOTHING;

SELECT cron.schedule('inventory-insights-twice-daily', '20 1,13 * * *',
  $$SELECT public.invoke_job_function('inventory-insights', '{"due":true}'::jsonb)$$);
