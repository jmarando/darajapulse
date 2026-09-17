ALTER TYPE public.geo_source ADD VALUE IF NOT EXISTS 'platform_region';
ALTER TYPE public.geo_source ADD VALUE IF NOT EXISTS 'inferred_hashtag';
ALTER TYPE public.geo_source ADD VALUE IF NOT EXISTS 'ai_estimated';

CREATE TABLE IF NOT EXISTS public.discovery_harvest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL,
  countries text[] NOT NULL DEFAULT '{}',
  credits_used integer NOT NULL DEFAULT 0,
  credits_remaining integer,
  candidates_seen integer NOT NULL DEFAULT 0,
  inserted_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  per_country jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  error text,
  started_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

GRANT SELECT ON public.discovery_harvest_runs TO authenticated;
GRANT ALL ON public.discovery_harvest_runs TO service_role;

ALTER TABLE public.discovery_harvest_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency staff can read harvest runs"
ON public.discovery_harvest_runs
FOR SELECT
TO authenticated
USING (true);

CREATE INDEX IF NOT EXISTS discovery_harvest_runs_created_at_idx ON public.discovery_harvest_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS discovery_creators_country_code_idx ON public.discovery_creators (country_code);

UPDATE public.discovery_creators
   SET country_code = CASE
         WHEN region ILIKE '%kenya%' THEN 'KE'
         WHEN region ILIKE '%uganda%' THEN 'UG'
         WHEN region ILIKE '%tanzania%' THEN 'TZ'
         WHEN region ILIKE '%zambia%' THEN 'ZM'
       END,
       country_source = 'defaulted'
 WHERE country_code IS NULL
   AND region IS NOT NULL
   AND (region ILIKE '%kenya%' OR region ILIKE '%uganda%' OR region ILIKE '%tanzania%' OR region ILIKE '%zambia%');