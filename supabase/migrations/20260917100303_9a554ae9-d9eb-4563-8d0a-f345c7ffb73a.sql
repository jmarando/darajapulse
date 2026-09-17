CREATE TABLE public.scraper_credit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  credits integer NOT NULL DEFAULT 0,
  credits_remaining integer,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  context text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scraper_credit_log_created_at ON public.scraper_credit_log (created_at DESC);

GRANT SELECT ON public.scraper_credit_log TO authenticated;
GRANT ALL ON public.scraper_credit_log TO service_role;

ALTER TABLE public.scraper_credit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view credit usage for their campaigns"
ON public.scraper_credit_log
FOR SELECT
TO authenticated
USING (
  campaign_id IS NULL
  OR public.agency_staff_on_campaign(auth.uid(), campaign_id)
  OR public.user_has_campaign_access(auth.uid(), campaign_id)
);