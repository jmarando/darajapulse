-- 1. Extend contest_entries
ALTER TABLE public.contest_entries
  ALTER COLUMN post_url DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS external_registration_id text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS lga text,
  ADD COLUMN IF NOT EXISTS instagram_handle text,
  ADD COLUMN IF NOT EXISTS tiktok_handle text,
  ADD COLUMN IF NOT EXISTS facebook_handle text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS contest_entries_contest_post_url_uidx
  ON public.contest_entries (contest_id, post_url)
  WHERE post_url IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contest_entries_contest_extreg_uidx
  ON public.contest_entries (contest_id, external_registration_id)
  WHERE external_registration_id IS NOT NULL;

-- 2. contestant_sync_runs
CREATE TABLE IF NOT EXISTS public.contestant_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid,
  source text NOT NULL DEFAULT 'feed',  -- 'feed' | 'apify'
  triggered_by text NOT NULL DEFAULT 'cron', -- 'cron' | 'manual'
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  fetched int NOT NULL DEFAULT 0,
  upserted int NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'running'
);

CREATE INDEX IF NOT EXISTS contestant_sync_runs_contest_started_idx
  ON public.contestant_sync_runs (contest_id, started_at DESC);

ALTER TABLE public.contestant_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency manages contestant_sync_runs" ON public.contestant_sync_runs;
CREATE POLICY "Agency manages contestant_sync_runs"
ON public.contestant_sync_runs
FOR ALL
USING (has_role(auth.uid(), 'agency_admin'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'agency_admin'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role));