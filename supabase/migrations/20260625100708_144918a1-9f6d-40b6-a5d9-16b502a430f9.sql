
-- 1) Restrict contest_entries public read to approved/winner only
DROP POLICY IF EXISTS "Public reads entries of active contests" ON public.contest_entries;
CREATE POLICY "Public reads approved entries of active contests"
  ON public.contest_entries FOR SELECT TO anon
  USING (
    status IN ('approved','winner')
    AND EXISTS (SELECT 1 FROM public.contests c WHERE c.id = contest_entries.contest_id AND c.is_active)
  );

-- 2) Lock contest_winners writes to agency staff on the contest
DROP POLICY IF EXISTS "Authenticated users manage contest winners" ON public.contest_winners;
CREATE POLICY "Agency staff manage contest winners"
  ON public.contest_winners FOR ALL TO authenticated
  USING (public.agency_staff_on_contest(auth.uid(), contest_id))
  WITH CHECK (public.agency_staff_on_contest(auth.uid(), contest_id));

-- 3) Column-level grants for anon — keep RLS row visibility, hide sensitive columns
-- agencies
REVOKE SELECT ON public.agencies FROM anon;
GRANT SELECT (id, name, slug, subdomain, display_name, logo_url, primary_color, support_email, hide_powered_by, is_active, is_default, kind, created_at, updated_at) ON public.agencies TO anon;

-- brand_orgs
REVOKE SELECT ON public.brand_orgs FROM anon;
GRANT SELECT (id, name, slug, subdomain, display_name, logo_url, primary_color, support_email, is_active, created_at, updated_at) ON public.brand_orgs TO anon;

-- clients — drop primary_contact_*, created_by from anon view
REVOKE SELECT ON public.clients FROM anon;
GRANT SELECT (id, name, industry, logo_url, country, slug, agency_id, created_at) ON public.clients TO anon;

-- influencers — drop email, phone_mpesa, notes from anon view
REVOKE SELECT ON public.influencers FROM anon;
GRANT SELECT (
  id, full_name, handle, primary_platform, niche, region, languages,
  follower_count, engagement_rate, avg_cpm_kes, audience_kenya_pct,
  authenticity_score, avatar_url, audience_age_breakdown,
  audience_gender_breakdown, audience_top_cities, alt_handles, agency_id,
  last_metrics_sync, created_at
) ON public.influencers TO anon;

-- 4) Storage: drop broad public SELECT on client-logos to prevent bucket listing
-- (Files remain reachable via the public CDN URL for public buckets.)
DROP POLICY IF EXISTS "Public can view client logos" ON storage.objects;

-- 5) Set search_path on pgmq wrapper SECURITY DEFINER functions
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;

-- 6) Revoke EXECUTE from anon/authenticated on SECURITY DEFINER functions that
--    are internal (triggers, cron, queue helpers). Keep grants on functions
--    used as RPCs or in RLS predicates.
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.run_contest_auto_polling() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_agency_id_from_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_brief_template_agency_id() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_campaign_agency_id() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_client_agency_id() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_contest_agency_id() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_campaign_slug() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_client_slug() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.contest_set_slug_token() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.contest_winners_set_updated_at() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_contest_winner_status() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;

-- Restrict admin/staff RPCs to authenticated only (not anon)
REVOKE EXECUTE ON FUNCTION public.get_agency_team() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_profiles_by_ids(uuid[]) FROM anon, public;
