
-- Extend discovery_creators
ALTER TABLE public.discovery_creators
  ADD COLUMN IF NOT EXISTS audience_demo jsonb,
  ADD COLUMN IF NOT EXISTS demo_source text,
  ADD COLUMN IF NOT EXISTS works_for text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS shows text[] DEFAULT '{}'::text[];

-- Extend inventory_items
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS demo_source text;

-- Shows table
CREATE TABLE IF NOT EXISTS public.shows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid REFERENCES public.agencies(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text,
  kind text NOT NULL DEFAULT 'tv',
  station text,
  host_names text[] DEFAULT '{}'::text[],
  host_creator_ids uuid[] DEFAULT '{}'::uuid[],
  airtime text,
  days_on_air text[] DEFAULT '{}'::text[],
  platforms text[] DEFAULT '{}'::text[],
  handles jsonb DEFAULT '{}'::jsonb,
  niche text[] DEFAULT '{}'::text[],
  region text DEFAULT 'Kenya',
  city text,
  logo_url text,
  description text,
  reach_estimate bigint DEFAULT 0,
  demographics jsonb,
  ai_confidence numeric,
  source text,
  notes text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shows_name_station_uidx
  ON public.shows (lower(name), lower(coalesce(station,'')));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shows TO authenticated;
GRANT ALL ON public.shows TO service_role;

ALTER TABLE public.shows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authed can read shows"
  ON public.shows FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "agency staff insert shows"
  ON public.shows FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (agency_id IS NOT NULL AND public.user_has_agency_access(auth.uid(), agency_id))
    OR agency_id IS NULL
  );

CREATE POLICY "agency staff update shows"
  ON public.shows FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (agency_id IS NOT NULL AND public.user_has_agency_access(auth.uid(), agency_id))
  );

CREATE POLICY "agency staff delete shows"
  ON public.shows FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (agency_id IS NOT NULL AND public.user_has_agency_access(auth.uid(), agency_id))
  );

CREATE TRIGGER shows_touch_updated BEFORE UPDATE ON public.shows
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Show contacts
CREATE TABLE IF NOT EXISTS public.show_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL REFERENCES public.shows(id) ON DELETE CASCADE,
  kind text NOT NULL,
  value text NOT NULL,
  label text,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (show_id, kind, value)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.show_contacts TO authenticated;
GRANT ALL ON public.show_contacts TO service_role;

ALTER TABLE public.show_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authed read show_contacts"
  ON public.show_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "authed insert show_contacts"
  ON public.show_contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authed update show_contacts"
  ON public.show_contacts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "authed delete show_contacts"
  ON public.show_contacts FOR DELETE TO authenticated USING (true);

-- Update get_public_storefront to include audience_demo + demo_source
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
        'revisions', i.revisions, 'tags', i.tags
      ) ORDER BY i.sort_order, i.title)
      FROM public.inventory_items i
      WHERE i.agency_id = a.id AND i.is_active
    ), '[]'::jsonb)
  )
  FROM public.agencies a
  WHERE a.slug = _agency_slug AND a.is_active
  LIMIT 1;
$function$;
