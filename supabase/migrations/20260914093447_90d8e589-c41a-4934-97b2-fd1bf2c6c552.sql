ALTER TABLE public.influencers
  ADD COLUMN IF NOT EXISTS demo_source text,
  ADD COLUMN IF NOT EXISTS demo_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_influencers_demo_source ON public.influencers(demo_source);