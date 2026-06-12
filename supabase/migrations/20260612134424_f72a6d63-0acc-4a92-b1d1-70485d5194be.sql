DROP POLICY IF EXISTS "Public reads brief_templates via active plan link" ON public.brief_templates;
CREATE POLICY "Public reads brief_templates via active plan link"
ON public.brief_templates
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.campaigns c
    JOIN public.plan_links pl ON pl.campaign_id = c.id
    WHERE c.brief_template_id = brief_templates.id
      AND pl.is_active = true
  )
);

DROP POLICY IF EXISTS "Public reads ci via active link" ON public.campaign_influencers;
CREATE POLICY "Public reads ci via active link"
ON public.campaign_influencers
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.report_links rl
    WHERE rl.campaign_id = campaign_influencers.campaign_id
      AND rl.is_active = true
  )
);

DROP POLICY IF EXISTS "Public reads ci via active plan link" ON public.campaign_influencers;
CREATE POLICY "Public reads ci via active plan link"
ON public.campaign_influencers
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.plan_links pl
    WHERE pl.campaign_id = campaign_influencers.campaign_id
      AND pl.is_active = true
  )
);

DROP POLICY IF EXISTS "Public reads campaigns via active link" ON public.campaigns;
CREATE POLICY "Public reads campaigns via active link"
ON public.campaigns
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.report_links rl
    WHERE rl.campaign_id = campaigns.id
      AND rl.is_active = true
  )
);

DROP POLICY IF EXISTS "Public reads campaigns via active plan link" ON public.campaigns;
CREATE POLICY "Public reads campaigns via active plan link"
ON public.campaigns
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.plan_links pl
    WHERE pl.campaign_id = campaigns.id
      AND pl.is_active = true
  )
);

DROP POLICY IF EXISTS "Public reads clients via active contest" ON public.clients;
CREATE POLICY "Public reads clients via active contest"
ON public.clients
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.contests c
    WHERE c.is_active = true
      AND COALESCE(
        c.client_id,
        (SELECT cm.client_id FROM public.campaigns cm WHERE cm.id = c.campaign_id)
      ) = clients.id
  )
);

DROP POLICY IF EXISTS "Public reads clients via active link" ON public.clients;
CREATE POLICY "Public reads clients via active link"
ON public.clients
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.campaigns c
    JOIN public.report_links rl ON rl.campaign_id = c.id
    WHERE c.client_id = clients.id
      AND rl.is_active = true
  )
);

DROP POLICY IF EXISTS "Public reads clients via active plan link" ON public.clients;
CREATE POLICY "Public reads clients via active plan link"
ON public.clients
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.campaigns c
    JOIN public.plan_links pl ON pl.campaign_id = c.id
    WHERE c.client_id = clients.id
      AND pl.is_active = true
  )
);

DROP POLICY IF EXISTS "Public reads content_comments via active link" ON public.content_comments;
CREATE POLICY "Public reads content_comments via active link"
ON public.content_comments
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.content_items ci
    JOIN public.report_links rl ON rl.campaign_id = ci.campaign_id
    WHERE ci.id = content_comments.content_item_id
      AND rl.is_active = true
  )
);

DROP POLICY IF EXISTS "Public reads content_items via active link" ON public.content_items;
CREATE POLICY "Public reads content_items via active link"
ON public.content_items
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.report_links rl
    WHERE rl.campaign_id = content_items.campaign_id
      AND rl.is_active = true
  )
);

DROP POLICY IF EXISTS "Public reads entries of active contests" ON public.contest_entries;
CREATE POLICY "Public reads entries of active contests"
ON public.contest_entries
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.contests c
    WHERE c.id = contest_entries.contest_id
      AND c.is_active = true
  )
);

DROP POLICY IF EXISTS "Public reads entries via report link" ON public.contest_entries;
CREATE POLICY "Public reads entries via report link"
ON public.contest_entries
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.contests c
    JOIN public.report_links rl ON rl.campaign_id = c.campaign_id
    WHERE c.id = contest_entries.contest_id
      AND rl.is_active = true
  )
);

DROP POLICY IF EXISTS "Public reads contest_excluded_handles for active contests" ON public.contest_excluded_handles;
CREATE POLICY "Public reads contest_excluded_handles for active contests"
ON public.contest_excluded_handles
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.contests c
    WHERE c.id = contest_excluded_handles.contest_id
      AND c.is_active = true
  )
);

DROP POLICY IF EXISTS "Public reads active contests" ON public.contests;
CREATE POLICY "Public reads active contests"
ON public.contests
FOR SELECT
TO anon
USING (is_active = true);

DROP POLICY IF EXISTS "Public reads contests via active link or token" ON public.contests;
CREATE POLICY "Public reads contests via active link or token"
ON public.contests
FOR SELECT
TO anon
USING (
  is_active = true
  AND EXISTS (
    SELECT 1
    FROM public.report_links rl
    WHERE rl.campaign_id = contests.campaign_id
      AND rl.is_active = true
  )
);

DROP POLICY IF EXISTS "Public reads influencers via active link" ON public.influencers;
CREATE POLICY "Public reads influencers via active link"
ON public.influencers
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.campaign_influencers ci
    JOIN public.report_links rl ON rl.campaign_id = ci.campaign_id
    WHERE ci.influencer_id = influencers.id
      AND rl.is_active = true
  )
);

DROP POLICY IF EXISTS "Public reads influencers via active plan link" ON public.influencers;
CREATE POLICY "Public reads influencers via active plan link"
ON public.influencers
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.campaign_influencers ci
    JOIN public.plan_links pl ON pl.campaign_id = ci.campaign_id
    WHERE ci.influencer_id = influencers.id
      AND pl.is_active = true
  )
);

DROP POLICY IF EXISTS "Public reads active plan links" ON public.plan_links;
CREATE POLICY "Public reads active plan links"
ON public.plan_links
FOR SELECT
TO anon
USING (is_active = true);

DROP POLICY IF EXISTS "Public reads post_metrics via active link" ON public.post_metrics;
CREATE POLICY "Public reads post_metrics via active link"
ON public.post_metrics
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.posts p
    JOIN public.report_links rl ON rl.campaign_id = p.campaign_id
    WHERE p.id = post_metrics.post_id
      AND rl.is_active = true
  )
);

DROP POLICY IF EXISTS "Public reads posts via active link" ON public.posts;
CREATE POLICY "Public reads posts via active link"
ON public.posts
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.report_links rl
    WHERE rl.campaign_id = posts.campaign_id
      AND rl.is_active = true
  )
);

DROP POLICY IF EXISTS "Public reads active report links" ON public.report_links;
CREATE POLICY "Public reads active report links"
ON public.report_links
FOR SELECT
TO anon
USING (is_active = true);