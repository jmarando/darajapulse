
CREATE TABLE public.facebook_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id uuid NOT NULL UNIQUE,
  page_id text NOT NULL,
  page_name text,
  page_username text,
  picture_url text,
  category text,
  page_access_token text NOT NULL,
  user_access_token text,
  token_expires_at timestamptz,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.facebook_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency manages facebook_accounts" ON public.facebook_accounts
  FOR ALL USING (has_role(auth.uid(), 'agency_admin'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'agency_admin'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role));

CREATE TABLE public.facebook_oauth_states (
  state text PRIMARY KEY,
  influencer_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.facebook_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency manages fb oauth states" ON public.facebook_oauth_states
  FOR ALL USING (has_role(auth.uid(), 'agency_admin'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'agency_admin'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role));
