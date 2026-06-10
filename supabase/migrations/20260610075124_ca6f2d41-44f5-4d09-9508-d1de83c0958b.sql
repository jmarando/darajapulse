
ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS monthly_fee_kes numeric NOT NULL DEFAULT 45000,
  ADD COLUMN IF NOT EXISTS billing_cycle text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS billing_notes text;

ALTER TABLE public.brand_orgs
  ADD COLUMN IF NOT EXISTS subscription_fee_kes numeric NOT NULL DEFAULT 180000,
  ADD COLUMN IF NOT EXISTS billing_cycle text NOT NULL DEFAULT 'quarterly',
  ADD COLUMN IF NOT EXISTS billing_notes text;
