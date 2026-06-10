
-- =========================================================
-- 1. Helper functions
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin')
$$;

CREATE OR REPLACE FUNCTION public.agency_staff_on_campaign(_user_id uuid, _campaign_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.campaigns c
    JOIN public.user_roles ur
      ON ur.user_id = _user_id
     AND ur.agency_id = c.agency_id
     AND ur.role IN ('agency_admin','account_manager')
    WHERE c.id = _campaign_id
  )
$$;

CREATE OR REPLACE FUNCTION public.agency_staff_on_post(_user_id uuid, _post_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.posts p
    JOIN public.campaigns c ON c.id = p.campaign_id
    JOIN public.user_roles ur
      ON ur.user_id = _user_id
     AND ur.agency_id = c.agency_id
     AND ur.role IN ('agency_admin','account_manager')
    WHERE p.id = _post_id
  )
$$;

CREATE OR REPLACE FUNCTION public.agency_staff_on_contest(_user_id uuid, _contest_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.contests co
    LEFT JOIN public.campaigns ca ON ca.id = co.campaign_id
    LEFT JOIN public.clients cl ON cl.id = COALESCE(co.client_id, ca.client_id)
    JOIN public.user_roles ur
      ON ur.user_id = _user_id
     AND ur.role IN ('agency_admin','account_manager')
     AND ur.agency_id = COALESCE(co.agency_id, ca.agency_id, cl.agency_id)
    WHERE co.id = _contest_id
  )
$$;

-- Replace user_has_agency_access to honour super_admin (already does) — keep as is.

-- =========================================================
-- 2. Backfill missing agency_id values
-- =========================================================
UPDATE public.campaigns c
   SET agency_id = cl.agency_id
  FROM public.clients cl
 WHERE c.client_id = cl.id AND c.agency_id IS NULL AND cl.agency_id IS NOT NULL;

UPDATE public.brief_templates bt
   SET agency_id = cl.agency_id
  FROM public.clients cl
 WHERE bt.client_id = cl.id AND bt.agency_id IS NULL AND cl.agency_id IS NOT NULL;

UPDATE public.contests co
   SET agency_id = COALESCE(ca.agency_id, cl.agency_id)
  FROM public.campaigns ca
  LEFT JOIN public.clients cl ON cl.id = ca.client_id
 WHERE co.campaign_id = ca.id AND co.agency_id IS NULL;

UPDATE public.contests co
   SET agency_id = cl.agency_id
  FROM public.clients cl
 WHERE co.client_id = cl.id AND co.agency_id IS NULL AND cl.agency_id IS NOT NULL;

-- =========================================================
-- 3. Triggers: auto-set agency_id from parent on insert
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_campaign_agency_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.agency_id IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT agency_id INTO NEW.agency_id FROM public.clients WHERE id = NEW.client_id;
  END IF;
  IF NEW.agency_id IS NULL THEN
    SELECT ur.agency_id INTO NEW.agency_id
      FROM public.user_roles ur
     WHERE ur.user_id = auth.uid()
       AND ur.role IN ('agency_admin','account_manager')
       AND ur.agency_id IS NOT NULL
     LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_campaign_agency_id ON public.campaigns;
CREATE TRIGGER trg_set_campaign_agency_id
  BEFORE INSERT ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_campaign_agency_id();

CREATE OR REPLACE FUNCTION public.set_client_agency_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.agency_id IS NULL THEN
    SELECT ur.agency_id INTO NEW.agency_id
      FROM public.user_roles ur
     WHERE ur.user_id = auth.uid()
       AND ur.role IN ('agency_admin','account_manager')
       AND ur.agency_id IS NOT NULL
     LIMIT 1;
    IF NEW.agency_id IS NULL THEN
      SELECT id INTO NEW.agency_id FROM public.agencies WHERE is_default LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_client_agency_id ON public.clients;
CREATE TRIGGER trg_set_client_agency_id
  BEFORE INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_client_agency_id();

CREATE OR REPLACE FUNCTION public.set_contest_agency_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _aid uuid;
BEGIN
  IF NEW.agency_id IS NULL THEN
    IF NEW.campaign_id IS NOT NULL THEN
      SELECT agency_id INTO _aid FROM public.campaigns WHERE id = NEW.campaign_id;
    END IF;
    IF _aid IS NULL AND NEW.client_id IS NOT NULL THEN
      SELECT agency_id INTO _aid FROM public.clients WHERE id = NEW.client_id;
    END IF;
    NEW.agency_id := _aid;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_contest_agency_id ON public.contests;
CREATE TRIGGER trg_set_contest_agency_id
  BEFORE INSERT ON public.contests
  FOR EACH ROW EXECUTE FUNCTION public.set_contest_agency_id();

CREATE OR REPLACE FUNCTION public.set_brief_template_agency_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.agency_id IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT agency_id INTO NEW.agency_id FROM public.clients WHERE id = NEW.client_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_brief_template_agency_id ON public.brief_templates;
CREATE TRIGGER trg_set_brief_template_agency_id
  BEFORE INSERT ON public.brief_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_brief_template_agency_id();

-- =========================================================
-- 4. Replace overly-permissive agency policies with per-agency scoping
-- =========================================================

-- clients
DROP POLICY IF EXISTS "Agency reads clients" ON public.clients;
DROP POLICY IF EXISTS "Agency writes clients" ON public.clients;
CREATE POLICY "Agency staff read their clients" ON public.clients
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_agency_access(auth.uid(), agency_id));
CREATE POLICY "Agency staff write their clients" ON public.clients
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_agency_access(auth.uid(), agency_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_agency_access(auth.uid(), agency_id));

-- campaigns
DROP POLICY IF EXISTS "Agency reads campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Agency writes campaigns" ON public.campaigns;
CREATE POLICY "Agency staff read their campaigns" ON public.campaigns
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_agency_access(auth.uid(), agency_id));
CREATE POLICY "Agency staff write their campaigns" ON public.campaigns
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_agency_access(auth.uid(), agency_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_agency_access(auth.uid(), agency_id));

-- contests
DROP POLICY IF EXISTS "Agency manages contests" ON public.contests;
CREATE POLICY "Agency staff manage their contests" ON public.contests
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_agency_access(auth.uid(), agency_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_agency_access(auth.uid(), agency_id));

-- brief_templates
DROP POLICY IF EXISTS "Agency manages brief_templates" ON public.brief_templates;
CREATE POLICY "Agency staff manage their brief_templates" ON public.brief_templates
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_agency_access(auth.uid(), agency_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_agency_access(auth.uid(), agency_id));

-- influencers (shared roster, but scope by agency_id when set; allow when null = shared)
DROP POLICY IF EXISTS "Agency reads influencers" ON public.influencers;
DROP POLICY IF EXISTS "Agency writes influencers" ON public.influencers;
CREATE POLICY "Agency staff read influencers" ON public.influencers
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR agency_id IS NULL
    OR public.user_has_agency_access(auth.uid(), agency_id)
  );
CREATE POLICY "Agency staff write influencers" ON public.influencers
  FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR agency_id IS NULL
    OR public.user_has_agency_access(auth.uid(), agency_id)
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR agency_id IS NULL
    OR public.user_has_agency_access(auth.uid(), agency_id)
  );

-- campaign_influencers (via campaign)
DROP POLICY IF EXISTS "Agency manages campaign_influencers" ON public.campaign_influencers;
CREATE POLICY "Agency staff manage their campaign_influencers" ON public.campaign_influencers
  FOR ALL TO authenticated
  USING (public.agency_staff_on_campaign(auth.uid(), campaign_id))
  WITH CHECK (public.agency_staff_on_campaign(auth.uid(), campaign_id));

-- content_items (via campaign)
DROP POLICY IF EXISTS "Agency manages content_items" ON public.content_items;
CREATE POLICY "Agency staff manage their content_items" ON public.content_items
  FOR ALL TO authenticated
  USING (public.agency_staff_on_campaign(auth.uid(), campaign_id))
  WITH CHECK (public.agency_staff_on_campaign(auth.uid(), campaign_id));

-- content_comments (via content_items.campaign)
DROP POLICY IF EXISTS "Agency manages content_comments" ON public.content_comments;
CREATE POLICY "Agency staff manage their content_comments" ON public.content_comments
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.content_items ci
    WHERE ci.id = content_comments.content_item_id
      AND public.agency_staff_on_campaign(auth.uid(), ci.campaign_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.content_items ci
    WHERE ci.id = content_comments.content_item_id
      AND public.agency_staff_on_campaign(auth.uid(), ci.campaign_id)
  ));

-- posts (via campaign)
DROP POLICY IF EXISTS "Agency manages posts" ON public.posts;
CREATE POLICY "Agency staff manage their posts" ON public.posts
  FOR ALL TO authenticated
  USING (public.agency_staff_on_campaign(auth.uid(), campaign_id))
  WITH CHECK (public.agency_staff_on_campaign(auth.uid(), campaign_id));

-- post_metrics (via posts)
DROP POLICY IF EXISTS "Agency manages metrics" ON public.post_metrics;
CREATE POLICY "Agency staff manage their post_metrics" ON public.post_metrics
  FOR ALL TO authenticated
  USING (public.agency_staff_on_post(auth.uid(), post_id))
  WITH CHECK (public.agency_staff_on_post(auth.uid(), post_id));

-- approvals (via posts)
DROP POLICY IF EXISTS "Agency manages approvals" ON public.approvals;
CREATE POLICY "Agency staff manage their approvals" ON public.approvals
  FOR ALL TO authenticated
  USING (public.agency_staff_on_post(auth.uid(), post_id))
  WITH CHECK (public.agency_staff_on_post(auth.uid(), post_id));

-- payouts (via campaign)
DROP POLICY IF EXISTS "Agency manages payouts" ON public.payouts;
CREATE POLICY "Agency staff manage their payouts" ON public.payouts
  FOR ALL TO authenticated
  USING (public.agency_staff_on_campaign(auth.uid(), campaign_id))
  WITH CHECK (public.agency_staff_on_campaign(auth.uid(), campaign_id));

-- contest_entries (via contest)
DROP POLICY IF EXISTS "Agency manages contest_entries" ON public.contest_entries;
CREATE POLICY "Agency staff manage their contest_entries" ON public.contest_entries
  FOR ALL TO authenticated
  USING (public.agency_staff_on_contest(auth.uid(), contest_id))
  WITH CHECK (public.agency_staff_on_contest(auth.uid(), contest_id));

-- =========================================================
-- 5. Fix signup trigger: stop auto-assigning agency roles to new users
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  -- Bootstrap: if no super_admin exists yet, the very first user becomes one.
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin') THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'super_admin');
  END IF;
  -- Otherwise: no role granted on signup. Admins assign roles via invite.

  RETURN NEW;
END $$;

-- =========================================================
-- 6. Cleanup: remove Justin's stray account_manager role on Daraja Pulse
-- =========================================================
DELETE FROM public.user_roles
 WHERE user_id = 'a52d2bfd-b794-4345-a3b3-a82d579abb76'
   AND role = 'account_manager'
   AND agency_id = '4dc78aaa-e8ec-40f1-911e-72e307028b4e';
