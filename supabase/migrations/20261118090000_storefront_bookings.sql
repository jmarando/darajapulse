-- Storefront bookings: buyers book and pay online on a media house's storefront (STOREFRONT_BOOKINGS_DESIGN.md).
--
-- Adds:
--   * inventory_items: bookable ("Book online"), price_model ('unit', or 'cpm' where the price is per 1,000 views or
--     listens and the buyer sets a budget), min_spend_kes (the least a CPM line takes), ad_format (what material the
--     listing needs from the buyer and how its preview is drawn).
--   * agencies: storefront_booking ('off'; 'test', where Book now shows only on the ?book=test link; 'on') and
--     storefront_production (the house's fees for making audio, banners and print).
--   * storefront_payment_details: where buyers pay a house by bank transfer (PesaLink or M-Pesa paybill). Staff of the
--     house read it; only its admins (and super admins) change it.
--   * storefront_bookings and storefront_booking_events: bookings and their history. Staff of the house read them. The
--     public never reads them: the storefront-booking function works them with the service role, guarded by each
--     booking's token, and every change goes through the booking functions.
--   * Storage bucket storefront-ads (private): ad files, reached only through signed links the functions hand out.
--   * get_public_storefront: each item's bookable, price_model, min_spend_kes and ad_format; the house's booking mode and
--     production fees. A house that hides its prices shows booking 'off' and no fees.
--
-- To roll back: re-create get_public_storefront from 20261116120000, then
--   DROP TABLE public.storefront_booking_events, public.storefront_bookings, public.storefront_payment_details;
--   empty and delete the storefront-ads bucket;
--   ALTER TABLE public.inventory_items DROP COLUMN bookable, DROP COLUMN price_model, DROP COLUMN min_spend_kes, DROP COLUMN ad_format;
--   ALTER TABLE public.agencies DROP COLUMN storefront_booking, DROP COLUMN storefront_production;

-- ---------------------------------------------------------------- listings and houses

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS bookable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_model text NOT NULL DEFAULT 'unit',
  ADD COLUMN IF NOT EXISTS min_spend_kes integer,
  ADD COLUMN IF NOT EXISTS ad_format text;

ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_price_model_check;
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_price_model_check CHECK (price_model IN ('unit', 'cpm'));
ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_min_spend_check;
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_min_spend_check CHECK (min_spend_kes IS NULL OR min_spend_kes >= 0);
ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_ad_format_check;
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_ad_format_check CHECK (ad_format IS NULL OR ad_format IN (
  'radio_spot', 'radio_mention', 'radio_interview', 'radio_classified', 'radio_promotion',
  'web_leaderboard', 'web_mpu', 'web_halfpage', 'web_takeover', 'web_article',
  'audio_preroll', 'audio_hostread', 'print_display', 'social_post', 'package'
));

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS storefront_booking text NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS storefront_production jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.agencies DROP CONSTRAINT IF EXISTS agencies_storefront_booking_check;
ALTER TABLE public.agencies ADD CONSTRAINT agencies_storefront_booking_check CHECK (storefront_booking IN ('off', 'test', 'on'));
ALTER TABLE public.agencies DROP CONSTRAINT IF EXISTS agencies_storefront_production_check;
ALTER TABLE public.agencies ADD CONSTRAINT agencies_storefront_production_check CHECK (jsonb_typeof(storefront_production) = 'object');

-- ---------------------------------------------------------------- where buyers pay a house by bank transfer

CREATE TABLE IF NOT EXISTS public.storefront_payment_details (
  agency_id uuid PRIMARY KEY REFERENCES public.agencies(id) ON DELETE CASCADE,
  account_name text,
  bank_name text,
  bank_branch text,
  account_number text,
  paybill text,
  paybill_account text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.storefront_payment_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storefront_payment_details FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.storefront_payment_details TO authenticated;
GRANT ALL ON public.storefront_payment_details TO service_role;

DROP POLICY IF EXISTS "Agency staff read payment details" ON public.storefront_payment_details;
CREATE POLICY "Agency staff read payment details" ON public.storefront_payment_details FOR SELECT TO authenticated
  USING (public.user_has_agency_access(auth.uid(), agency_id));
DROP POLICY IF EXISTS "Agency admins add payment details" ON public.storefront_payment_details;
CREATE POLICY "Agency admins add payment details" ON public.storefront_payment_details FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.agency_id = storefront_payment_details.agency_id AND r.role = 'agency_admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );
DROP POLICY IF EXISTS "Agency admins change payment details" ON public.storefront_payment_details;
CREATE POLICY "Agency admins change payment details" ON public.storefront_payment_details FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.agency_id = storefront_payment_details.agency_id AND r.role = 'agency_admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.agency_id = storefront_payment_details.agency_id AND r.role = 'agency_admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP TRIGGER IF EXISTS storefront_payment_details_touch ON public.storefront_payment_details;
CREATE TRIGGER storefront_payment_details_touch BEFORE UPDATE ON public.storefront_payment_details
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------- bookings

CREATE TABLE IF NOT EXISTS public.storefront_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  ref text NOT NULL UNIQUE,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('awaiting_payment', 'paid', 'changes_requested', 'approved', 'live', 'done', 'cancelled')),
  final_state text NOT NULL DEFAULT 'none' CHECK (final_state IN ('none', 'awaiting_buyer', 'approved', 'changes')),
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  company text,
  kra_pin text,
  client_name text,
  -- What was booked, priced when it was booked: listing, choice, quantity or budget, views, dates, unit price, total.
  lines jsonb NOT NULL CHECK (jsonb_typeof(lines) = 'array'),
  materials jsonb NOT NULL DEFAULT '{}'::jsonb,
  kit jsonb NOT NULL DEFAULT '{}'::jsonb,
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  final_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  media_kes integer NOT NULL CHECK (media_kes >= 0),
  production_kes integer NOT NULL DEFAULT 0 CHECK (production_kes >= 0),
  vat_kes integer NOT NULL CHECK (vat_kes >= 0),
  total_kes integer NOT NULL CHECK (total_kes > 0),
  start_date date NOT NULL,
  end_date date,
  pay_method text NOT NULL CHECK (pay_method IN ('pesapal', 'bank')),
  pesapal_tracking_id text,
  pesapal_attempt integer NOT NULL DEFAULT 0,
  pesapal_status text,
  paid_at timestamptz,
  payment_ref text,
  payment_claimed_at timestamptz,
  payment_claimed_ref text,
  refunded boolean NOT NULL DEFAULT false,
  refund_ref text,
  request_id uuid REFERENCES public.inventory_bookings(id) ON DELETE SET NULL,
  schedule_note text,
  proof jsonb NOT NULL DEFAULT '{}'::jsonb,
  internal_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS storefront_bookings_agency_idx ON public.storefront_bookings (agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS storefront_bookings_email_idx ON public.storefront_bookings (contact_email, created_at DESC);
CREATE INDEX IF NOT EXISTS storefront_bookings_pesapal_idx ON public.storefront_bookings (pesapal_tracking_id)
  WHERE pesapal_tracking_id IS NOT NULL;

ALTER TABLE public.storefront_bookings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storefront_bookings FROM anon, authenticated;
GRANT SELECT ON public.storefront_bookings TO authenticated;
GRANT ALL ON public.storefront_bookings TO service_role;

DROP POLICY IF EXISTS "Agency staff read storefront bookings" ON public.storefront_bookings;
CREATE POLICY "Agency staff read storefront bookings" ON public.storefront_bookings FOR SELECT TO authenticated
  USING (public.user_has_agency_access(auth.uid(), agency_id));

DROP TRIGGER IF EXISTS storefront_bookings_touch ON public.storefront_bookings;
CREATE TRIGGER storefront_bookings_touch BEFORE UPDATE ON public.storefront_bookings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.storefront_booking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.storefront_bookings(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL CHECK (actor IN ('buyer', 'house', 'system')),
  actor_user uuid,
  kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS storefront_booking_events_booking_idx ON public.storefront_booking_events (booking_id, at);

ALTER TABLE public.storefront_booking_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storefront_booking_events FROM anon, authenticated;
GRANT SELECT ON public.storefront_booking_events TO authenticated;
GRANT ALL ON public.storefront_booking_events TO service_role;

DROP POLICY IF EXISTS "Agency staff read storefront booking events" ON public.storefront_booking_events;
CREATE POLICY "Agency staff read storefront booking events" ON public.storefront_booking_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.storefront_bookings b
    WHERE b.id = storefront_booking_events.booking_id AND public.user_has_agency_access(auth.uid(), b.agency_id)
  ));

-- ---------------------------------------------------------------- ad files

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('storefront-ads', 'storefront-ads', false, 26214400, ARRAY[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
  'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'video/mp4'
])
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------- the public storefront

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
      'show_prices', a.storefront_show_prices,
      'booking', CASE WHEN a.storefront_show_prices THEN a.storefront_booking ELSE 'off' END,
      'production', CASE WHEN a.storefront_show_prices THEN a.storefront_production ELSE '{}'::jsonb END
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
        END,
        'bookable', i.bookable AND a.storefront_show_prices,
        'price_model', i.price_model,
        'min_spend_kes', CASE WHEN a.storefront_show_prices THEN i.min_spend_kes END,
        'ad_format', i.ad_format
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
