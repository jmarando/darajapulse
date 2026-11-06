-- The Groundwork link: what Pulse keeps so Groundwork campaigns can brief creators here and read back
-- what they posted and were paid.
--
-- Why: Groundwork (a separate product for political campaigns) sends a campaign brief to Pulse, reads
-- back the creators, their posts at peak and their payouts, and records the voices its office has
-- approached. The edge functions groundwork-brief, groundwork-report and groundwork-prospect are the
-- door; this is what sits behind it. Until it is applied those functions cannot run.
--
-- What:
--   * campaigns.political (default false) and campaigns.paid_for_by. A political campaign carries its
--     "Paid for by" line on every post, and is the only kind discovery-match keeps political and news
--     creators in for. Every campaign that exists today stays false.
--   * groundwork_links: one Groundwork campaign is one Pulse campaign. Service role only.
--   * groundwork_prospects: a voice Groundwork's office has approached for a campaign. It is kept apart
--     from the shared creator roster on purpose. One row per campaign, platform and handle, so a repeat
--     send updates it. Its status moves here, not from Groundwork. Service role only.
--   * An internal_job_keys row named groundwork. The key is made by the table's default. Read it once
--     from the table editor (never from a query's output) and set it as PULSE_JOB_KEY in Groundwork.
--
-- Checked with supabase/verify/groundwork_link.sql inside a rolled-back DO block.
--
-- To roll back:
--   DELETE FROM public.internal_job_keys WHERE name = 'groundwork';
--   DROP TABLE IF EXISTS public.groundwork_prospects;
--   DROP TABLE IF EXISTS public.groundwork_links;
--   ALTER TABLE public.campaigns DROP COLUMN IF EXISTS paid_for_by, DROP COLUMN IF EXISTS political;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS political boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_for_by text;

CREATE TABLE IF NOT EXISTS public.groundwork_links (
  groundwork_campaign_id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL UNIQUE REFERENCES public.campaigns(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.groundwork_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  -- Groundwork's own platform word ("x" among them), not Pulse's platform enum.
  platform text NOT NULL CHECK (platform = lower(platform) AND length(platform) BETWEEN 1 AND 20),
  handle text NOT NULL CHECK (handle = lower(handle) AND handle !~ '[@[:space:]]' AND length(handle) BETWEEN 1 AND 100),
  name text CHECK (length(name) <= 120),
  url text CHECK (url ~ '^https://' AND length(url) <= 500),
  followers bigint CHECK (followers >= 0),
  invitation text CHECK (length(invitation) <= 4000),
  why text[] NOT NULL DEFAULT '{}',
  paid_for_by text NOT NULL CHECK (length(paid_for_by) BETWEEN 3 AND 160),
  status text NOT NULL DEFAULT 'approached' CHECK (status IN ('approached', 'invited', 'on_roster', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, platform, handle)
);

DROP TRIGGER IF EXISTS groundwork_prospects_updated_at ON public.groundwork_prospects;
CREATE TRIGGER groundwork_prospects_updated_at
BEFORE UPDATE ON public.groundwork_prospects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Row security on with no policy, and no grant to the public roles: only the edge functions
-- (service role) reach these tables, always filtered by the agency named in GROUNDWORK_AGENCY_SLUG.
ALTER TABLE public.groundwork_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groundwork_prospects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.groundwork_links FROM anon, authenticated;
REVOKE ALL ON public.groundwork_prospects FROM anon, authenticated;
GRANT ALL ON public.groundwork_links TO service_role;
GRANT ALL ON public.groundwork_prospects TO service_role;

COMMENT ON TABLE public.groundwork_links IS 'One Groundwork campaign is one Pulse campaign. Service role only.';
COMMENT ON TABLE public.groundwork_prospects IS 'Voices a Groundwork office has approached for a campaign. Service role only.';

INSERT INTO public.internal_job_keys(name) VALUES ('groundwork') ON CONFLICT (name) DO NOTHING;
