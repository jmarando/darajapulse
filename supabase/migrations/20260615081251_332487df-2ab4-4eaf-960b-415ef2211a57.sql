
-- inventory item kinds
DO $$ BEGIN
  CREATE TYPE public.inventory_kind AS ENUM ('owned_account','influencer','ad_slot','bundle');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.booking_status AS ENUM ('new','reviewing','quoted','won','lost');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  kind public.inventory_kind NOT NULL,
  title text NOT NULL,
  subtitle text,
  description text,
  platform text,                 -- instagram | tiktok | youtube | twitter | facebook | tv | radio | web | mixed
  handle text,
  cover_url text,
  follower_count bigint DEFAULT 0,
  engagement_rate numeric(5,2) DEFAULT 0,
  audience_demo jsonb DEFAULT '{}'::jsonb,  -- {age:{}, gender:{}, geo:{}}
  deliverable_type text,         -- "IG Reel", "TikTok video", "30s show segment"...
  base_rate_kes integer DEFAULT 0,   -- admin-only, never returned to public
  turnaround_days integer,
  revisions integer,
  tags text[] DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_items_agency_idx ON public.inventory_items(agency_id, is_active, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT SELECT ON public.inventory_items TO anon;
GRANT ALL ON public.inventory_items TO service_role;

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active inventory"
  ON public.inventory_items FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "Agency staff manage inventory"
  ON public.inventory_items FOR ALL
  TO authenticated
  USING (public.user_has_agency_access(auth.uid(), agency_id))
  WITH CHECK (public.user_has_agency_access(auth.uid(), agency_id));

CREATE TRIGGER inventory_items_touch
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


CREATE TABLE IF NOT EXISTS public.inventory_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  -- snapshot of cart at time of submit, since item could change/be deleted
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  company text,
  budget_kes integer,
  target_start date,
  target_end date,
  message text,
  status public.booking_status NOT NULL DEFAULT 'new',
  internal_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_bookings_agency_idx ON public.inventory_bookings(agency_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_bookings TO authenticated;
GRANT INSERT ON public.inventory_bookings TO anon;
GRANT ALL ON public.inventory_bookings TO service_role;

ALTER TABLE public.inventory_bookings ENABLE ROW LEVEL SECURITY;

-- anyone can submit a quote request
CREATE POLICY "Public can submit booking"
  ON public.inventory_bookings FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- only agency staff (or super admin) can read / manage requests for their agency
CREATE POLICY "Agency staff read bookings"
  ON public.inventory_bookings FOR SELECT
  TO authenticated
  USING (public.user_has_agency_access(auth.uid(), agency_id));

CREATE POLICY "Agency staff update bookings"
  ON public.inventory_bookings FOR UPDATE
  TO authenticated
  USING (public.user_has_agency_access(auth.uid(), agency_id))
  WITH CHECK (public.user_has_agency_access(auth.uid(), agency_id));

CREATE POLICY "Agency staff delete bookings"
  ON public.inventory_bookings FOR DELETE
  TO authenticated
  USING (public.user_has_agency_access(auth.uid(), agency_id));

CREATE TRIGGER inventory_bookings_touch
  BEFORE UPDATE ON public.inventory_bookings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Secure public read: a SECURITY DEFINER function that returns items WITHOUT base_rate_kes
CREATE OR REPLACE FUNCTION public.get_public_storefront(_agency_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
        'deliverable_type', i.deliverable_type, 'turnaround_days', i.turnaround_days,
        'revisions', i.revisions, 'tags', i.tags
      ) ORDER BY i.sort_order, i.title)
      FROM public.inventory_items i
      WHERE i.agency_id = a.id AND i.is_active
    ), '[]'::jsonb)
  )
  FROM public.agencies a
  WHERE a.slug = _agency_slug AND a.is_active
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_storefront(text) TO anon, authenticated;
