-- shows: remove tautological read policy
DROP POLICY IF EXISTS "authed can read shows" ON public.shows;
CREATE POLICY "staff can read shows"
ON public.shows FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (agency_id IS NOT NULL AND public.user_has_agency_access(auth.uid(), agency_id))
  OR (agency_id IS NULL AND (
    public.has_role(auth.uid(), 'agency_admin'::app_role)
    OR public.has_role(auth.uid(), 'account_manager'::app_role)
  ))
);

-- discovery_harvest_runs: restrict to staff roles
DROP POLICY IF EXISTS "Agency staff can read harvest runs" ON public.discovery_harvest_runs;
CREATE POLICY "Staff can read harvest runs"
ON public.discovery_harvest_runs FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_role(auth.uid(), 'agency_admin'::app_role)
  OR public.has_role(auth.uid(), 'account_manager'::app_role)
  OR started_by = auth.uid()
);

-- reference data: signed-in users only
DROP POLICY IF EXISTS "Countries readable by everyone" ON public.countries;
CREATE POLICY "Countries readable by signed-in users"
ON public.countries FOR SELECT TO authenticated
USING (is_active);

DROP POLICY IF EXISTS "Cities readable by everyone" ON public.cities;
CREATE POLICY "Cities readable by signed-in users"
ON public.cities FOR SELECT TO authenticated
USING (is_active);

REVOKE SELECT ON public.countries FROM anon;
REVOKE SELECT ON public.cities FROM anon;

-- demo_requests: validated public submissions
DROP POLICY IF EXISTS "Anyone can submit a demo request" ON public.demo_requests;
CREATE POLICY "Anyone can submit a valid demo request"
ON public.demo_requests FOR INSERT TO anon, authenticated
WITH CHECK (
  email ~* '^[A-Za-z0-9._%%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  AND length(email) <= 320
  AND length(coalesce(name, '')) <= 200
  AND length(coalesce(company, '')) <= 200
  AND length(coalesce(role, '')) <= 200
  AND length(coalesce(message, '')) <= 5000
  AND length(coalesce(source, '')) <= 100
  AND email_status IS NULL
);

-- data_deletion_requests: validated public submissions
DROP POLICY IF EXISTS "Anyone can submit a deletion request" ON public.data_deletion_requests;
CREATE POLICY "Anyone can submit a valid deletion request"
ON public.data_deletion_requests FOR INSERT TO anon, authenticated
WITH CHECK (
  email ~* '^[A-Za-z0-9._%%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  AND length(email) <= 320
  AND length(coalesce(platform_user_id, '')) <= 200
  AND length(coalesce(details, '')) <= 5000
  AND coalesce(status, 'pending') = 'pending'
);

-- inventory_bookings: validated public enquiries
DROP POLICY IF EXISTS "Public can submit booking" ON public.inventory_bookings;
CREATE POLICY "Public can submit a valid booking"
ON public.inventory_bookings FOR INSERT TO anon, authenticated
WITH CHECK (
  agency_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.agencies a WHERE a.id = agency_id AND a.is_active)
  AND contact_email ~* '^[A-Za-z0-9._%%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  AND length(contact_email) <= 320
  AND length(coalesce(contact_name, '')) <= 200
  AND length(coalesce(contact_phone, '')) <= 50
  AND length(coalesce(company, '')) <= 200
  AND length(coalesce(message, '')) <= 5000
  AND coalesce(status, 'new') = 'new'
  AND internal_notes IS NULL
  AND coalesce(budget_kes, 0) >= 0
);

-- storage: creator drafts
DROP POLICY IF EXISTS "creator drafts overwrite" ON storage.objects;
CREATE POLICY "Owners can replace their creator drafts"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'creator-drafts' AND owner_id = (select auth.uid()::text))
WITH CHECK (bucket_id = 'creator-drafts' AND owner_id = (select auth.uid()::text));

DROP POLICY IF EXISTS "Signed-in users can read creator drafts" ON storage.objects;
CREATE POLICY "Owners and staff can read creator drafts"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'creator-drafts'
  AND (
    owner_id = (select auth.uid()::text)
    OR public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'agency_admin'::app_role)
    OR public.has_role(auth.uid(), 'account_manager'::app_role)
  )
);
