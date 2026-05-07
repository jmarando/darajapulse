
-- Per-campaign scoping for client users
CREATE TABLE IF NOT EXISTS public.campaign_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, user_id)
);

ALTER TABLE public.campaign_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency manages campaign_members"
ON public.campaign_members FOR ALL
USING (has_role(auth.uid(), 'agency_admin') OR has_role(auth.uid(), 'account_manager'))
WITH CHECK (has_role(auth.uid(), 'agency_admin') OR has_role(auth.uid(), 'account_manager'));

CREATE POLICY "Users see own campaign memberships"
ON public.campaign_members FOR SELECT
USING (auth.uid() = user_id);

-- Update access function: if user has any campaign_members rows for this client, restrict to those; otherwise all client's campaigns
CREATE OR REPLACE FUNCTION public.user_has_campaign_access(_user_id uuid, _campaign_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH camp AS (SELECT client_id FROM public.campaigns WHERE id = _campaign_id)
  SELECT EXISTS (
    SELECT 1
    FROM public.client_members cm, camp
    WHERE cm.user_id = _user_id
      AND cm.client_id = camp.client_id
      AND (
        -- no per-campaign restriction for this user on this client → full access
        NOT EXISTS (
          SELECT 1 FROM public.campaign_members km
          JOIN public.campaigns c2 ON c2.id = km.campaign_id
          WHERE km.user_id = _user_id AND c2.client_id = camp.client_id
        )
        OR EXISTS (
          SELECT 1 FROM public.campaign_members km
          WHERE km.user_id = _user_id AND km.campaign_id = _campaign_id
        )
      )
  );
$$;

-- Public client logos bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-logos', 'client-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can view client logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'client-logos');

CREATE POLICY "Agency uploads client logos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'client-logos' AND (has_role(auth.uid(),'agency_admin') OR has_role(auth.uid(),'account_manager')));

CREATE POLICY "Agency updates client logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'client-logos' AND (has_role(auth.uid(),'agency_admin') OR has_role(auth.uid(),'account_manager')));

CREATE POLICY "Agency deletes client logos"
ON storage.objects FOR DELETE
USING (bucket_id = 'client-logos' AND (has_role(auth.uid(),'agency_admin') OR has_role(auth.uid(),'account_manager')));
