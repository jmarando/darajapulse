-- Storefront prices a media house chooses to show, and the choices one listing offers.
--
-- Why: a storefront listing carried one price that buyers never saw, so nobody could tell what a plan would cost, and
-- every choice on a rate card (time of day, pack size, show) needed its own listing. Radio Africa publishes its rate
-- card on its own site and wants buyers to see it. Separately, the public key could read every active listing straight
-- from the table, base_rate_kes included, whatever the storefront showed.
--
-- What:
--   * agencies.storefront_show_prices (default false): when on, the storefront shows each listing's price and a running
--     total of the buyer's plan. When off, no price leaves the database, as before.
--   * inventory_items.price_unit: what one price buys, as a noun ("spot", "week", "package", "4 weeks"), so the page can
--     say "KES 35,000 a spot" and "10 spots".
--   * inventory_items.options: the choices a listing offers, an array of objects with a text label, and optionally
--     price_kes (null or absent means on request) and unit (else the listing's price_unit).
--   * get_public_storefront: agency.show_prices, and on each item price_kes (base_rate_kes when shown and above 0),
--     price_unit and options (every option's price_kes removed when prices are not shown).
--   * The anonymous role loses its privileges on inventory_items. Public pages read listings only through
--     get_public_storefront and get_public_listing_insights, which are SECURITY DEFINER and unaffected. Signed-in users
--     keep their access (the app's Inventory and Campaign pages read the table directly).
--
-- To roll back: re-create get_public_storefront from 20261113120000, then
--   ALTER TABLE public.inventory_items DROP CONSTRAINT inventory_items_options_shape, DROP COLUMN options, DROP COLUMN price_unit;
--   ALTER TABLE public.agencies DROP COLUMN storefront_show_prices;
--   (GRANT SELECT ON public.inventory_items TO anon would reopen the public read of base_rate_kes, so leave it out.)

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS storefront_show_prices boolean NOT NULL DEFAULT false;

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS price_unit text,
  ADD COLUMN IF NOT EXISTS options jsonb;

ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_options_shape;
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_options_shape CHECK (
  options IS NULL OR (
    jsonb_typeof(options) = 'array'
    AND NOT jsonb_path_exists(options, '$[*] ? (@.type() != "object" || !(@.label.type() == "string"))')
  )
);

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
      'primary_color', a.primary_color, 'support_email', a.support_email,
      'show_prices', a.storefront_show_prices
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
        'insights_summary', x.insights->'summary',
        'price_kes', CASE WHEN a.storefront_show_prices AND i.base_rate_kes > 0 THEN i.base_rate_kes END,
        'price_unit', i.price_unit,
        'options', CASE
          WHEN i.options IS NULL THEN NULL
          WHEN a.storefront_show_prices THEN i.options
          ELSE (SELECT COALESCE(jsonb_agg(o - 'price_kes' ORDER BY n), '[]'::jsonb)
                FROM jsonb_array_elements(i.options) WITH ORDINALITY AS e(o, n))
        END
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

REVOKE ALL ON public.inventory_items FROM anon;
