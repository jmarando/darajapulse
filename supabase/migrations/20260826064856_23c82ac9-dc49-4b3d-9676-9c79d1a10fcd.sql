CREATE TABLE public.event_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  influencer_id uuid REFERENCES public.influencers(id) ON DELETE SET NULL,
  email text NOT NULL,
  name text,
  status text NOT NULL DEFAULT 'yes',
  source text NOT NULL DEFAULT 'manual',
  note text,
  responded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, email)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_rsvps TO authenticated;
GRANT ALL ON public.event_rsvps TO service_role;

ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Campaign members manage rsvps"
ON public.event_rsvps FOR ALL TO authenticated
USING (public.user_has_campaign_access(auth.uid(), campaign_id))
WITH CHECK (public.user_has_campaign_access(auth.uid(), campaign_id));

CREATE TRIGGER event_rsvps_touch BEFORE UPDATE ON public.event_rsvps
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_event_rsvps_campaign ON public.event_rsvps(campaign_id);