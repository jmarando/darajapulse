CREATE TABLE public.stories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  influencer_id uuid NOT NULL REFERENCES public.influencers(id) ON DELETE CASCADE,
  platform public.platform NOT NULL DEFAULT 'instagram',
  posted_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone,
  media_url text,
  permalink text,
  caption text,
  reach integer,
  impressions integer,
  replies integer,
  link_clicks integer,
  taps_forward integer,
  taps_back integer,
  exits integer,
  source text NOT NULL DEFAULT 'manual',
  external_id text,
  verified boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX stories_external_uniq ON public.stories (platform, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX stories_campaign_idx ON public.stories (campaign_id, posted_at DESC);
CREATE INDEX stories_influencer_idx ON public.stories (influencer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stories TO authenticated;
GRANT SELECT ON public.stories TO anon;
GRANT ALL ON public.stories TO service_role;

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency staff manage their stories" ON public.stories
  FOR ALL TO authenticated
  USING (public.agency_staff_on_campaign(auth.uid(), campaign_id))
  WITH CHECK (public.agency_staff_on_campaign(auth.uid(), campaign_id));

CREATE POLICY "Client users read their stories" ON public.stories
  FOR SELECT
  USING (public.user_has_campaign_access(auth.uid(), campaign_id));

CREATE POLICY "Public reads stories via active link" ON public.stories
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.report_links rl WHERE rl.campaign_id = stories.campaign_id AND rl.is_active = true));

CREATE TRIGGER stories_touch BEFORE UPDATE ON public.stories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();