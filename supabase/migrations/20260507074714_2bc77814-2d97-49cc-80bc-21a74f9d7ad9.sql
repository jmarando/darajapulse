
-- client_members: maps auth users to clients they can access
CREATE TABLE IF NOT EXISTS public.client_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  invited_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, user_id)
);

ALTER TABLE public.client_members ENABLE ROW LEVEL SECURITY;

-- Helper: does this user have access to this client?
CREATE OR REPLACE FUNCTION public.user_has_client_access(_user_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.client_members
    WHERE user_id = _user_id AND client_id = _client_id
  )
$$;

-- Helper: does this user have access to this campaign (via its client)?
CREATE OR REPLACE FUNCTION public.user_has_campaign_access(_user_id uuid, _campaign_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.campaigns c
    JOIN public.client_members cm ON cm.client_id = c.client_id
    WHERE c.id = _campaign_id AND cm.user_id = _user_id
  )
$$;

-- Policies for client_members itself
CREATE POLICY "Agency manages client_members"
ON public.client_members FOR ALL
USING (has_role(auth.uid(),'agency_admin') OR has_role(auth.uid(),'account_manager'))
WITH CHECK (has_role(auth.uid(),'agency_admin') OR has_role(auth.uid(),'account_manager'));

CREATE POLICY "Users see own memberships"
ON public.client_members FOR SELECT
USING (auth.uid() = user_id);

-- Extend SELECT access for client users on relevant tables
CREATE POLICY "Client users read their clients"
ON public.clients FOR SELECT
USING (public.user_has_client_access(auth.uid(), id));

CREATE POLICY "Client users read their campaigns"
ON public.campaigns FOR SELECT
USING (public.user_has_client_access(auth.uid(), client_id));

CREATE POLICY "Client users read their posts"
ON public.posts FOR SELECT
USING (public.user_has_campaign_access(auth.uid(), campaign_id));

CREATE POLICY "Client users read their post_metrics"
ON public.post_metrics FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.posts p
  WHERE p.id = post_metrics.post_id
    AND public.user_has_campaign_access(auth.uid(), p.campaign_id)
));

CREATE POLICY "Client users read their content_items"
ON public.content_items FOR SELECT
USING (public.user_has_campaign_access(auth.uid(), campaign_id));

CREATE POLICY "Client users read their content_comments"
ON public.content_comments FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.content_items ci
  WHERE ci.id = content_comments.content_item_id
    AND public.user_has_campaign_access(auth.uid(), ci.campaign_id)
));

-- Allow client users to add comments on content they can see
CREATE POLICY "Client users insert content_comments"
ON public.content_comments FOR INSERT
WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.content_items ci
    WHERE ci.id = content_item_id
      AND public.user_has_campaign_access(auth.uid(), ci.campaign_id)
  )
);

CREATE POLICY "Client users read their contests"
ON public.contests FOR SELECT
USING (public.user_has_campaign_access(auth.uid(), campaign_id));

CREATE POLICY "Client users read approved contest entries"
ON public.contest_entries FOR SELECT
USING (
  status IN ('approved','winner')
  AND EXISTS (
    SELECT 1 FROM public.contests c
    WHERE c.id = contest_entries.contest_id
      AND public.user_has_campaign_access(auth.uid(), c.campaign_id)
  )
);

CREATE POLICY "Client users read their campaign_influencers"
ON public.campaign_influencers FOR SELECT
USING (public.user_has_campaign_access(auth.uid(), campaign_id));

CREATE POLICY "Client users read their influencers"
ON public.influencers FOR SELECT
USING (EXISTS (
  SELECT 1
  FROM public.campaign_influencers ci
  WHERE ci.influencer_id = influencers.id
    AND public.user_has_campaign_access(auth.uid(), ci.campaign_id)
));
