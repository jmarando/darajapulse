-- 1. Fixed search_path on email queue helpers
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = pgmq, public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = pgmq, public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = pgmq, public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = pgmq, public;

-- 2. Share-link helpers (security definer so anon policies never need to read the token column)
CREATE OR REPLACE FUNCTION public.campaign_has_active_report_link(_campaign_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.report_links rl WHERE rl.campaign_id = _campaign_id AND rl.is_active)
$$;

CREATE OR REPLACE FUNCTION public.campaign_has_active_plan_link(_campaign_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.plan_links pl WHERE pl.campaign_id = _campaign_id AND pl.is_active)
$$;

CREATE OR REPLACE FUNCTION public.get_report_link_campaign(_token text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rl.campaign_id FROM public.report_links rl
  WHERE rl.token = _token AND rl.is_active LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_plan_link_campaign(_token text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pl.campaign_id FROM public.plan_links pl
  WHERE pl.token = _token AND pl.is_active LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_report_link_campaign(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_plan_link_campaign(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_has_active_report_link(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_has_active_plan_link(uuid) TO anon, authenticated;

-- 3. Rewrite every anon policy that joined report_links/plan_links to use the helpers
DROP POLICY IF EXISTS "Public reads active report links" ON public.report_links;
DROP POLICY IF EXISTS "Public reads active plan links" ON public.plan_links;
REVOKE SELECT ON public.report_links FROM anon;
REVOKE SELECT ON public.plan_links FROM anon;

DROP POLICY IF EXISTS "Public reads campaigns via active link" ON public.campaigns;
CREATE POLICY "Public reads campaigns via active link" ON public.campaigns FOR SELECT TO anon
USING (public.campaign_has_active_report_link(id));
DROP POLICY IF EXISTS "Public reads campaigns via active plan link" ON public.campaigns;
CREATE POLICY "Public reads campaigns via active plan link" ON public.campaigns FOR SELECT TO anon
USING (public.campaign_has_active_plan_link(id));

DROP POLICY IF EXISTS "Public reads ci via active link" ON public.campaign_influencers;
CREATE POLICY "Public reads ci via active link" ON public.campaign_influencers FOR SELECT TO anon
USING (public.campaign_has_active_report_link(campaign_id));
DROP POLICY IF EXISTS "Public reads ci via active plan link" ON public.campaign_influencers;
CREATE POLICY "Public reads ci via active plan link" ON public.campaign_influencers FOR SELECT TO anon
USING (public.campaign_has_active_plan_link(campaign_id));

DROP POLICY IF EXISTS "Public reads clients via active link" ON public.clients;
CREATE POLICY "Public reads clients via active link" ON public.clients FOR SELECT TO anon
USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.client_id = clients.id AND public.campaign_has_active_report_link(c.id)));
DROP POLICY IF EXISTS "Public reads clients via active plan link" ON public.clients;
CREATE POLICY "Public reads clients via active plan link" ON public.clients FOR SELECT TO anon
USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.client_id = clients.id AND public.campaign_has_active_plan_link(c.id)));

DROP POLICY IF EXISTS "Public reads brief_templates via active plan link" ON public.brief_templates;
CREATE POLICY "Public reads brief_templates via active plan link" ON public.brief_templates FOR SELECT TO anon
USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.brief_template_id = brief_templates.id AND public.campaign_has_active_plan_link(c.id)));

DROP POLICY IF EXISTS "Public reads content_items via active link" ON public.content_items;
CREATE POLICY "Public reads content_items via active link" ON public.content_items FOR SELECT TO anon
USING (public.campaign_has_active_report_link(campaign_id));

DROP POLICY IF EXISTS "Public reads content_comments via active link" ON public.content_comments;
CREATE POLICY "Public reads content_comments via active link" ON public.content_comments FOR SELECT TO anon
USING (EXISTS (SELECT 1 FROM public.content_items ci WHERE ci.id = content_comments.content_item_id AND public.campaign_has_active_report_link(ci.campaign_id)));

DROP POLICY IF EXISTS "Public reads posts via active link" ON public.posts;
CREATE POLICY "Public reads posts via active link" ON public.posts FOR SELECT TO anon
USING (public.campaign_has_active_report_link(campaign_id));

DROP POLICY IF EXISTS "Public reads post_metrics via active link" ON public.post_metrics;
CREATE POLICY "Public reads post_metrics via active link" ON public.post_metrics FOR SELECT TO anon
USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_metrics.post_id AND public.campaign_has_active_report_link(p.campaign_id)));

DROP POLICY IF EXISTS "Public reads stories via active link" ON public.stories;
CREATE POLICY "Public reads stories via active link" ON public.stories FOR SELECT TO anon
USING (public.campaign_has_active_report_link(campaign_id));

DROP POLICY IF EXISTS "Public reads influencers via active link" ON public.influencers;
CREATE POLICY "Public reads influencers via active link" ON public.influencers FOR SELECT TO anon
USING (EXISTS (SELECT 1 FROM public.campaign_influencers ci WHERE ci.influencer_id = influencers.id AND public.campaign_has_active_report_link(ci.campaign_id)));
DROP POLICY IF EXISTS "Public reads influencers via active plan link" ON public.influencers;
CREATE POLICY "Public reads influencers via active plan link" ON public.influencers FOR SELECT TO anon
USING (EXISTS (SELECT 1 FROM public.campaign_influencers ci WHERE ci.influencer_id = influencers.id AND public.campaign_has_active_plan_link(ci.campaign_id)));

DROP POLICY IF EXISTS "Public reads contests via active report link" ON public.contests;
CREATE POLICY "Public reads contests via active report link" ON public.contests FOR SELECT TO anon
USING (public.campaign_has_active_report_link(campaign_id));

-- 4. contest_entries: only approved/winner rows via report link, and no PII columns for anon
DROP POLICY IF EXISTS "Public reads entries via report link" ON public.contest_entries;
CREATE POLICY "Public reads approved entries via report link" ON public.contest_entries FOR SELECT TO anon
USING (
  status = ANY (ARRAY['approved'::text, 'winner'::text])
  AND EXISTS (SELECT 1 FROM public.contests c WHERE c.id = contest_entries.contest_id AND public.campaign_has_active_report_link(c.campaign_id))
);
REVOKE SELECT ON public.contest_entries FROM anon;
GRANT SELECT (id, contest_id, influencer_id, platform, post_url, handle, caption, thumbnail_url,
  posted_at, views, likes, comments, shares, saves, score, round_number, status, source,
  submitter_name, full_name, instagram_handle, tiktok_handle, facebook_handle, cross_posts, created_at)
ON public.contest_entries TO anon;

-- 5. contest_winners: scope to staff, client users, or an active share link
DROP POLICY IF EXISTS "Anyone can view contest winners" ON public.contest_winners;
CREATE POLICY "Winners visible via share link" ON public.contest_winners FOR SELECT TO anon
USING (EXISTS (
  SELECT 1 FROM public.contests c
  WHERE c.id = contest_winners.contest_id
    AND (public.campaign_has_active_report_link(c.campaign_id) OR public.campaign_has_active_plan_link(c.campaign_id))
));
CREATE POLICY "Winners visible to campaign members" ON public.contest_winners FOR SELECT TO authenticated
USING (
  public.agency_staff_on_contest(auth.uid(), contest_id)
  OR EXISTS (SELECT 1 FROM public.contests c WHERE c.id = contest_winners.contest_id AND public.user_has_campaign_access(auth.uid(), c.campaign_id))
);

-- 6. contest_excluded_handles: require the real submission token via RPC only
DROP POLICY IF EXISTS "Public reads contest_excluded_handles via submission token" ON public.contest_excluded_handles;

-- 7. Discovery + reporting scoping
DROP POLICY IF EXISTS "Agency team manages discovery searches" ON public.discovery_searches;
CREATE POLICY "Users manage their own discovery searches" ON public.discovery_searches FOR ALL TO authenticated
USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()))
WITH CHECK (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Agency team manages discovery creators" ON public.discovery_creators;
CREATE POLICY "Agency team reads discovery creators" ON public.discovery_creators FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'agency_admin'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role));
CREATE POLICY "Admins write discovery creators" ON public.discovery_creators FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'agency_admin'::app_role) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Admins update discovery creators" ON public.discovery_creators FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'agency_admin'::app_role) OR public.is_super_admin(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'agency_admin'::app_role) OR public.is_super_admin(auth.uid()));
CREATE POLICY "Super admins delete discovery creators" ON public.discovery_creators FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Agency team manages discovery contacts" ON public.discovery_contacts;
CREATE POLICY "Agency team reads discovery contacts" ON public.discovery_contacts FOR SELECT TO authenticated
USING (
  is_public
  OR added_by = auth.uid()
  OR has_role(auth.uid(), 'agency_admin'::app_role)
  OR public.is_super_admin(auth.uid())
);
CREATE POLICY "Agency team adds discovery contacts" ON public.discovery_contacts FOR INSERT TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'agency_admin'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
  AND (added_by IS NULL OR added_by = auth.uid())
);
CREATE POLICY "Owners update discovery contacts" ON public.discovery_contacts FOR UPDATE TO authenticated
USING (added_by = auth.uid() OR public.is_super_admin(auth.uid()))
WITH CHECK (added_by = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "Owners delete discovery contacts" ON public.discovery_contacts FOR DELETE TO authenticated
USING (added_by = auth.uid() OR has_role(auth.uid(), 'agency_admin'::app_role) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Agency manages report_recipients" ON public.report_recipients;
CREATE POLICY "Agency manages report_recipients" ON public.report_recipients FOR ALL TO authenticated
USING (
  public.agency_staff_on_campaign(auth.uid(), campaign_id)
  OR (contest_id IS NOT NULL AND public.agency_staff_on_contest(auth.uid(), contest_id))
  OR public.is_super_admin(auth.uid())
)
WITH CHECK (
  public.agency_staff_on_campaign(auth.uid(), campaign_id)
  OR (contest_id IS NOT NULL AND public.agency_staff_on_contest(auth.uid(), contest_id))
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "Agency manages report_schedules" ON public.report_schedules;
CREATE POLICY "Agency manages report_schedules" ON public.report_schedules FOR ALL TO authenticated
USING (
  public.agency_staff_on_campaign(auth.uid(), campaign_id)
  OR (contest_id IS NOT NULL AND public.agency_staff_on_contest(auth.uid(), contest_id))
  OR public.is_super_admin(auth.uid())
)
WITH CHECK (
  public.agency_staff_on_campaign(auth.uid(), campaign_id)
  OR (contest_id IS NOT NULL AND public.agency_staff_on_contest(auth.uid(), contest_id))
  OR public.is_super_admin(auth.uid())
);

-- 8. Social OAuth tokens: scope through influencers.agency_id
CREATE OR REPLACE FUNCTION public.staff_on_influencer(_user_id uuid, _influencer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.influencers i
    WHERE i.id = _influencer_id
      AND public.user_has_agency_access(_user_id, i.agency_id)
  )
$$;
GRANT EXECUTE ON FUNCTION public.staff_on_influencer(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Agency manages facebook_accounts" ON public.facebook_accounts;
CREATE POLICY "Agency manages facebook_accounts" ON public.facebook_accounts FOR ALL TO authenticated
USING (public.staff_on_influencer(auth.uid(), influencer_id))
WITH CHECK (public.staff_on_influencer(auth.uid(), influencer_id));

DROP POLICY IF EXISTS "Agency manages instagram_accounts" ON public.instagram_accounts;
CREATE POLICY "Agency manages instagram_accounts" ON public.instagram_accounts FOR ALL TO authenticated
USING (public.staff_on_influencer(auth.uid(), influencer_id))
WITH CHECK (public.staff_on_influencer(auth.uid(), influencer_id));

DROP POLICY IF EXISTS "Agency manages tiktok_accounts" ON public.tiktok_accounts;
CREATE POLICY "Agency manages tiktok_accounts" ON public.tiktok_accounts FOR ALL TO authenticated
USING (public.staff_on_influencer(auth.uid(), influencer_id))
WITH CHECK (public.staff_on_influencer(auth.uid(), influencer_id));

DROP POLICY IF EXISTS "Agency manages fb oauth states" ON public.facebook_oauth_states;
CREATE POLICY "Agency manages fb oauth states" ON public.facebook_oauth_states FOR ALL TO authenticated
USING (public.staff_on_influencer(auth.uid(), influencer_id))
WITH CHECK (public.staff_on_influencer(auth.uid(), influencer_id));

DROP POLICY IF EXISTS "Agency manages ig oauth states" ON public.instagram_oauth_states;
CREATE POLICY "Agency manages ig oauth states" ON public.instagram_oauth_states FOR ALL TO authenticated
USING (public.staff_on_influencer(auth.uid(), influencer_id))
WITH CHECK (public.staff_on_influencer(auth.uid(), influencer_id));

DROP POLICY IF EXISTS "Agency manages oauth states" ON public.tiktok_oauth_states;
CREATE POLICY "Agency manages tiktok oauth states" ON public.tiktok_oauth_states FOR ALL TO authenticated
USING (public.staff_on_influencer(auth.uid(), influencer_id))
WITH CHECK (public.staff_on_influencer(auth.uid(), influencer_id));

-- 9. story-proofs storage: scope by campaign id in the object path
DROP POLICY IF EXISTS "Authenticated read story proofs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload story proofs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update story proofs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete story proofs" ON storage.objects;

CREATE POLICY "Campaign staff read story proofs" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'story-proofs'
  AND public.agency_staff_on_campaign(auth.uid(), NULLIF(split_part(name, '/', 1), '')::uuid)
);
CREATE POLICY "Campaign staff upload story proofs" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'story-proofs'
  AND public.agency_staff_on_campaign(auth.uid(), NULLIF(split_part(name, '/', 1), '')::uuid)
);
CREATE POLICY "Campaign staff update story proofs" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'story-proofs'
  AND public.agency_staff_on_campaign(auth.uid(), NULLIF(split_part(name, '/', 1), '')::uuid)
);
CREATE POLICY "Campaign staff delete story proofs" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'story-proofs'
  AND public.agency_staff_on_campaign(auth.uid(), NULLIF(split_part(name, '/', 1), '')::uuid)
);