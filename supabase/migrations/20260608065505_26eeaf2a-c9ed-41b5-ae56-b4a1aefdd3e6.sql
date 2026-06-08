
CREATE TABLE public.discovery_creators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  handle text NOT NULL,
  platform text NOT NULL,
  profile_url text,
  niche text[] DEFAULT '{}',
  region text DEFAULT 'Kenya',
  city text,
  follower_count integer DEFAULT 0,
  engagement_rate numeric(5,2) DEFAULT 0,
  bio text,
  avatar_url text,
  source text NOT NULL DEFAULT 'ai_seed',
  ai_confidence numeric(3,2) DEFAULT 0,
  verified_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, handle)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_creators TO authenticated;
GRANT ALL ON public.discovery_creators TO service_role;
ALTER TABLE public.discovery_creators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency team manages discovery creators" ON public.discovery_creators
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin') OR public.has_role(auth.uid(), 'account_manager'))
  WITH CHECK (public.has_role(auth.uid(), 'agency_admin') OR public.has_role(auth.uid(), 'account_manager'));
CREATE TRIGGER discovery_creators_touch BEFORE UPDATE ON public.discovery_creators FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX discovery_creators_platform_idx ON public.discovery_creators(platform);
CREATE INDEX discovery_creators_niche_idx ON public.discovery_creators USING gin(niche);

CREATE TABLE public.discovery_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.discovery_creators(id) ON DELETE CASCADE,
  kind text NOT NULL,
  value text NOT NULL,
  label text,
  is_public boolean NOT NULL DEFAULT false,
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_contacts TO authenticated;
GRANT ALL ON public.discovery_contacts TO service_role;
ALTER TABLE public.discovery_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency team manages discovery contacts" ON public.discovery_contacts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin') OR public.has_role(auth.uid(), 'account_manager'))
  WITH CHECK (public.has_role(auth.uid(), 'agency_admin') OR public.has_role(auth.uid(), 'account_manager'));
CREATE INDEX discovery_contacts_creator_idx ON public.discovery_contacts(creator_id);

CREATE TABLE public.discovery_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  brief jsonb NOT NULL,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_searches TO authenticated;
GRANT ALL ON public.discovery_searches TO service_role;
ALTER TABLE public.discovery_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency team manages discovery searches" ON public.discovery_searches
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin') OR public.has_role(auth.uid(), 'account_manager'))
  WITH CHECK (public.has_role(auth.uid(), 'agency_admin') OR public.has_role(auth.uid(), 'account_manager'));
