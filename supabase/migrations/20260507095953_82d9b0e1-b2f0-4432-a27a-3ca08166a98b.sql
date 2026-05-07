
-- Add audience demographic breakdowns (stored as JSONB percentage maps that sum to ~100)
ALTER TABLE public.influencers
  ADD COLUMN IF NOT EXISTS audience_age_breakdown jsonb DEFAULT '{"13-17": 5, "18-24": 35, "25-34": 35, "35-44": 15, "45-54": 7, "55+": 3}'::jsonb,
  ADD COLUMN IF NOT EXISTS audience_gender_breakdown jsonb DEFAULT '{"female": 55, "male": 43, "other": 2}'::jsonb,
  ADD COLUMN IF NOT EXISTS audience_top_cities jsonb DEFAULT '[{"city":"Nairobi","pct":48},{"city":"Mombasa","pct":14},{"city":"Kisumu","pct":9},{"city":"Nakuru","pct":7},{"city":"Eldoret","pct":5}]'::jsonb;

-- Seed plausible variations on existing rows that still have defaults
UPDATE public.influencers
SET
  audience_age_breakdown = (
    CASE (abs(hashtext(id::text)) % 4)
      WHEN 0 THEN '{"13-17": 8, "18-24": 42, "25-34": 30, "35-44": 12, "45-54": 5, "55+": 3}'::jsonb
      WHEN 1 THEN '{"13-17": 4, "18-24": 28, "25-34": 38, "35-44": 18, "45-54": 8, "55+": 4}'::jsonb
      WHEN 2 THEN '{"13-17": 12, "18-24": 48, "25-34": 25, "35-44": 9, "45-54": 4, "55+": 2}'::jsonb
      ELSE '{"13-17": 3, "18-24": 22, "25-34": 40, "35-44": 22, "45-54": 9, "55+": 4}'::jsonb
    END
  ),
  audience_gender_breakdown = (
    CASE (abs(hashtext(id::text || 'g')) % 3)
      WHEN 0 THEN '{"female": 62, "male": 36, "other": 2}'::jsonb
      WHEN 1 THEN '{"female": 48, "male": 50, "other": 2}'::jsonb
      ELSE '{"female": 30, "male": 68, "other": 2}'::jsonb
    END
  ),
  audience_top_cities = (
    CASE (abs(hashtext(id::text || 'c')) % 3)
      WHEN 0 THEN '[{"city":"Nairobi","pct":52},{"city":"Mombasa","pct":15},{"city":"Kisumu","pct":10},{"city":"Nakuru","pct":7},{"city":"Eldoret","pct":4}]'::jsonb
      WHEN 1 THEN '[{"city":"Nairobi","pct":40},{"city":"Mombasa","pct":18},{"city":"Kisumu","pct":12},{"city":"Nakuru","pct":9},{"city":"Eldoret","pct":6}]'::jsonb
      ELSE '[{"city":"Nairobi","pct":58},{"city":"Mombasa","pct":12},{"city":"Kisumu","pct":8},{"city":"Nakuru","pct":6},{"city":"Eldoret","pct":4}]'::jsonb
    END
  );
