DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    agency_id IS NOT NULL
    AND public.has_role(auth.uid(), 'agency_admin')
    AND EXISTS (
      SELECT 1
      FROM public.user_roles caller
      WHERE caller.user_id = auth.uid()
        AND caller.role = 'agency_admin'
        AND caller.agency_id = user_roles.agency_id
    )
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    agency_id IS NOT NULL
    AND public.has_role(auth.uid(), 'agency_admin')
    AND EXISTS (
      SELECT 1
      FROM public.user_roles caller
      WHERE caller.user_id = auth.uid()
        AND caller.role = 'agency_admin'
        AND caller.agency_id = user_roles.agency_id
    )
  )
);

DROP POLICY IF EXISTS "Users see own roles" ON public.user_roles;
CREATE POLICY "Users see own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_super_admin(auth.uid())
  OR (
    agency_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles caller
      WHERE caller.user_id = auth.uid()
        AND caller.role IN ('agency_admin','account_manager')
        AND caller.agency_id = user_roles.agency_id
    )
  )
  OR (
    brand_org_id IS NOT NULL
    AND public.user_has_brand_org_access(auth.uid(), brand_org_id)
  )
);

DROP POLICY IF EXISTS "Agency manages client_members" ON public.client_members;
CREATE POLICY "Agency manages client_members"
ON public.client_members
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = client_members.client_id
      AND public.user_has_agency_access(auth.uid(), c.agency_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = client_members.client_id
      AND public.user_has_agency_access(auth.uid(), c.agency_id)
  )
);

DROP POLICY IF EXISTS "Users see own memberships" ON public.client_members;
CREATE POLICY "Users see own memberships"
ON public.client_members
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Agency manages campaign_members" ON public.campaign_members;
CREATE POLICY "Agency manages campaign_members"
ON public.campaign_members
FOR ALL
TO authenticated
USING (public.agency_staff_on_campaign(auth.uid(), campaign_id))
WITH CHECK (public.agency_staff_on_campaign(auth.uid(), campaign_id));

DROP POLICY IF EXISTS "Users see own campaign memberships" ON public.campaign_members;
CREATE POLICY "Users see own campaign memberships"
ON public.campaign_members
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Agency reads client_team_members" ON public.client_team_members;
CREATE POLICY "Agency reads client_team_members"
ON public.client_team_members
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = client_team_members.client_id
      AND public.user_has_agency_access(auth.uid(), c.agency_id)
  )
);

DROP POLICY IF EXISTS "Agency writes client_team_members" ON public.client_team_members;
CREATE POLICY "Agency writes client_team_members"
ON public.client_team_members
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = client_team_members.client_id
      AND public.user_has_agency_access(auth.uid(), c.agency_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = client_team_members.client_id
      AND public.user_has_agency_access(auth.uid(), c.agency_id)
  )
);

DROP POLICY IF EXISTS "Agency reads campaign_team_members" ON public.campaign_team_members;
CREATE POLICY "Agency reads campaign_team_members"
ON public.campaign_team_members
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.agency_staff_on_campaign(auth.uid(), campaign_id)
);

DROP POLICY IF EXISTS "Agency writes campaign_team_members" ON public.campaign_team_members;
CREATE POLICY "Agency writes campaign_team_members"
ON public.campaign_team_members
FOR ALL
TO authenticated
USING (public.agency_staff_on_campaign(auth.uid(), campaign_id))
WITH CHECK (public.agency_staff_on_campaign(auth.uid(), campaign_id));

DROP POLICY IF EXISTS "Agency manages contest_excluded_handles" ON public.contest_excluded_handles;
CREATE POLICY "Agency manages contest_excluded_handles"
ON public.contest_excluded_handles
FOR ALL
TO authenticated
USING (public.agency_staff_on_contest(auth.uid(), contest_id))
WITH CHECK (public.agency_staff_on_contest(auth.uid(), contest_id));

DROP POLICY IF EXISTS "Agency manages contestant_sync_runs" ON public.contestant_sync_runs;
CREATE POLICY "Agency manages contestant_sync_runs"
ON public.contestant_sync_runs
FOR ALL
TO authenticated
USING (public.agency_staff_on_contest(auth.uid(), contest_id))
WITH CHECK (public.agency_staff_on_contest(auth.uid(), contest_id));

CREATE OR REPLACE FUNCTION public.get_agency_team()
RETURNS TABLE(id uuid, full_name text, email text, avatar_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT p.id, p.full_name, p.email, p.avatar_url
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role IN ('agency_admin','account_manager')
    AND (
      public.is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.user_roles caller
        WHERE caller.user_id = auth.uid()
          AND caller.role IN ('agency_admin','account_manager')
          AND caller.agency_id = ur.agency_id
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.get_profiles_by_ids(_ids uuid[])
RETURNS TABLE(id uuid, full_name text, email text, avatar_url text, title text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT p.id, p.full_name, p.email, p.avatar_url, p.title
  FROM public.profiles p
  WHERE p.id = ANY(_ids)
    AND (
      p.id = auth.uid()
      OR public.is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.user_roles target
        JOIN public.user_roles caller ON caller.agency_id = target.agency_id
        WHERE target.user_id = p.id
          AND target.agency_id IS NOT NULL
          AND caller.user_id = auth.uid()
          AND caller.role IN ('agency_admin','account_manager')
      )
    );
$function$;