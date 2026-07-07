ALTER TABLE public.influencers
  ADD COLUMN IF NOT EXISTS referral_url text,
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS referral_registrations integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_deposits_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_deposits_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_currency text NOT NULL DEFAULT 'KES',
  ADD COLUMN IF NOT EXISTS referral_updated_at timestamptz;