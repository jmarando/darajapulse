CREATE TABLE public.tiktok_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id uuid NOT NULL UNIQUE,
  open_id text NOT NULL,
  union_id text,
  display_name text,
  avatar_url text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tiktok_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency manages tiktok_accounts" ON public.tiktok_accounts
  FOR ALL
  USING (has_role(auth.uid(), 'agency_admin'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'agency_admin'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role));

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS tiktok_video_id text;
CREATE INDEX IF NOT EXISTS posts_tiktok_video_id_idx ON public.posts(tiktok_video_id);

-- Short-lived OAuth state tokens to bind callback to influencer
CREATE TABLE public.tiktok_oauth_states (
  state text PRIMARY KEY,
  influencer_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tiktok_oauth_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency manages oauth states" ON public.tiktok_oauth_states
  FOR ALL
  USING (has_role(auth.uid(), 'agency_admin'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'agency_admin'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role));