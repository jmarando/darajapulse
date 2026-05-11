
CREATE TABLE public.client_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  user_id uuid NOT NULL,
  team_role text NOT NULL DEFAULT 'account_manager',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, user_id)
);
ALTER TABLE public.client_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency reads client_team_members" ON public.client_team_members
FOR SELECT USING (has_role(auth.uid(),'agency_admin') OR has_role(auth.uid(),'account_manager'));

CREATE POLICY "Agency writes client_team_members" ON public.client_team_members
FOR ALL USING (has_role(auth.uid(),'agency_admin') OR has_role(auth.uid(),'account_manager'))
WITH CHECK (has_role(auth.uid(),'agency_admin') OR has_role(auth.uid(),'account_manager'));

CREATE TABLE public.campaign_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  user_id uuid NOT NULL,
  team_role text NOT NULL DEFAULT 'account_manager',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, user_id)
);
ALTER TABLE public.campaign_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency reads campaign_team_members" ON public.campaign_team_members
FOR SELECT USING (has_role(auth.uid(),'agency_admin') OR has_role(auth.uid(),'account_manager'));

CREATE POLICY "Agency writes campaign_team_members" ON public.campaign_team_members
FOR ALL USING (has_role(auth.uid(),'agency_admin') OR has_role(auth.uid(),'account_manager'))
WITH CHECK (has_role(auth.uid(),'agency_admin') OR has_role(auth.uid(),'account_manager'));

CREATE INDEX idx_ctm_client ON public.client_team_members(client_id);
CREATE INDEX idx_ctm_user ON public.client_team_members(user_id);
CREATE INDEX idx_kctm_campaign ON public.campaign_team_members(campaign_id);
CREATE INDEX idx_kctm_user ON public.campaign_team_members(user_id);
