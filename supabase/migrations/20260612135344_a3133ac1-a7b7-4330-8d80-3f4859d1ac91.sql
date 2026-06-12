DROP POLICY IF EXISTS "Agency manages report_links" ON public.report_links;
CREATE POLICY "Agency manages report_links"
ON public.report_links
FOR ALL
TO authenticated
USING (public.agency_staff_on_campaign(auth.uid(), campaign_id))
WITH CHECK (public.agency_staff_on_campaign(auth.uid(), campaign_id));

DROP POLICY IF EXISTS "Agency manages plan_links" ON public.plan_links;
CREATE POLICY "Agency manages plan_links"
ON public.plan_links
FOR ALL
TO authenticated
USING (public.agency_staff_on_campaign(auth.uid(), campaign_id))
WITH CHECK (public.agency_staff_on_campaign(auth.uid(), campaign_id));