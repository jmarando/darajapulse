
-- Allow contests to declare explicit round boundaries (overrides round_days)
ALTER TABLE public.contests
  ADD COLUMN IF NOT EXISTS manual_round_cutoffs timestamptz[] NOT NULL DEFAULT '{}';

-- Configure the Royco contest: round 1 archived; round 2 starts Sun May 24 12:00 EAT (09:00 UTC)
UPDATE public.contests
  SET manual_round_cutoffs = ARRAY['2026-05-24 09:00:00+00'::timestamptz]
  WHERE id = '531899fc-0c0a-45e5-afcf-211f48d8e6fd';

-- Backfill round_number for that contest's entries based on the cutoff
UPDATE public.contest_entries
  SET round_number = CASE
    WHEN COALESCE(posted_at, created_at) < '2026-05-24 09:00:00+00'::timestamptz THEN 1
    ELSE 2
  END
  WHERE contest_id = '531899fc-0c0a-45e5-afcf-211f48d8e6fd';
