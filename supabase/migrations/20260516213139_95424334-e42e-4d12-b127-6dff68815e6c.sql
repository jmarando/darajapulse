
CREATE TABLE public.instagram_oauth_states (
  state text PRIMARY KEY,
  influencer_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.instagram_oauth_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency manages ig oauth states" ON public.instagram_oauth_states
  USING (has_role(auth.uid(),'agency_admin') OR has_role(auth.uid(),'account_manager'))
  WITH CHECK (has_role(auth.uid(),'agency_admin') OR has_role(auth.uid(),'account_manager'));

CREATE TABLE public.instagram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id uuid NOT NULL UNIQUE,
  ig_user_id text NOT NULL,
  username text,
  name text,
  profile_picture_url text,
  page_id text,
  page_access_token text NOT NULL,
  user_access_token text,
  token_expires_at timestamptz,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency manages instagram_accounts" ON public.instagram_accounts
  USING (has_role(auth.uid(),'agency_admin') OR has_role(auth.uid(),'account_manager'))
  WITH CHECK (has_role(auth.uid(),'agency_admin') OR has_role(auth.uid(),'account_manager'));
