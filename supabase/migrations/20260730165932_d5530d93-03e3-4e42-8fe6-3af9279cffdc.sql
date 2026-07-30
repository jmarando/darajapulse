-- 1. agencies / brand_orgs: remove blanket anon read (public branding is served by SECURITY DEFINER RPCs)
DROP POLICY IF EXISTS "Public can read agency branding" ON public.agencies;
DROP POLICY IF EXISTS "Public can read brand org branding" ON public.brand_orgs;
REVOKE SELECT ON public.agencies FROM anon;
REVOKE SELECT ON public.brand_orgs FROM anon;

-- 2. contests: token-existence check was always true. Public reads only via an active share link.
DROP POLICY IF EXISTS "Public reads contests with submission token" ON public.contests;
DROP POLICY IF EXISTS "Public reads contests via active link or token" ON public.contests;
CREATE POLICY "Public reads contests via active report link"
ON public.contests FOR SELECT TO anon
USING (EXISTS (
  SELECT 1 FROM public.report_links rl
  WHERE rl.campaign_id = contests.campaign_id AND rl.is_active
));

-- 3. contest_entries: drop always-true token policy, strip PII columns from anon
DROP POLICY IF EXISTS "Public reads entries via contest submission token" ON public.contest_entries;
REVOKE SELECT ON public.contest_entries FROM anon;
GRANT SELECT (id, contest_id, influencer_id, platform, post_url, handle, caption,
  thumbnail_url, posted_at, views, likes, comments, shares, saves, score,
  round_number, status, source, submitter_name, full_name, lga,
  instagram_handle, tiktok_handle, facebook_handle, cross_posts, metadata,
  external_registration_id, last_polled_at, created_at)
ON public.contest_entries TO anon;

-- token-scoped public read for the public contest report page
CREATE OR REPLACE FUNCTION public.get_contest_entries_by_token(_token text, _offset int DEFAULT 0, _limit int DEFAULT 1000)
RETURNS TABLE(
  id uuid, contest_id uuid, platform text, post_url text, handle text, caption text,
  thumbnail_url text, posted_at timestamptz, views integer, likes integer, comments integer,
  shares integer, saves integer, score numeric, round_number integer, status text, source text,
  submitter_name text, full_name text, instagram_handle text, tiktok_handle text,
  facebook_handle text, cross_posts jsonb, metadata jsonb, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT ce.id, ce.contest_id, ce.platform::text, ce.post_url, ce.handle, ce.caption,
         ce.thumbnail_url, ce.posted_at, ce.views, ce.likes, ce.comments, ce.shares,
         ce.saves, ce.score, ce.round_number, ce.status, ce.source, ce.submitter_name,
         ce.full_name, ce.instagram_handle, ce.tiktok_handle, ce.facebook_handle,
         ce.cross_posts, ce.metadata, ce.created_at
  FROM public.contest_entries ce
  JOIN public.contests c ON c.id = ce.contest_id
  WHERE c.submission_token = _token
  ORDER BY ce.id
  OFFSET GREATEST(COALESCE(_offset, 0), 0)
  LIMIT LEAST(COALESCE(_limit, 1000), 1000);
$$;
GRANT EXECUTE ON FUNCTION public.get_contest_entries_by_token(text, int, int) TO anon, authenticated;

-- handles used for filtering out roster/agency creators on the public report
CREATE OR REPLACE FUNCTION public.get_contest_filter_handles(_token text)
RETURNS TABLE(handle text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH c AS (SELECT id FROM public.contests WHERE submission_token = _token LIMIT 1)
  SELECT DISTINCT h FROM (
    SELECT i.handle AS h FROM public.influencers i, c
    UNION ALL
    SELECT unnest(i.alt_handles) FROM public.influencers i, c
    UNION ALL
    SELECT eh.handle FROM public.contest_excluded_handles eh JOIN c ON c.id = eh.contest_id
  ) s WHERE h IS NOT NULL AND h <> '';
$$;
GRANT EXECUTE ON FUNCTION public.get_contest_filter_handles(text) TO anon, authenticated;

-- 4. influencers: remove blanket anon read + strip contact columns from anon
DROP POLICY IF EXISTS "Public reads influencer handles for filtering" ON public.influencers;
REVOKE SELECT ON public.influencers FROM anon;
GRANT SELECT (id, full_name, handle, primary_platform, niche, region, languages,
  follower_count, engagement_rate, avg_cpm_kes, audience_kenya_pct, authenticity_score,
  avatar_url, alt_handles, agency_id, audience_age_breakdown, audience_gender_breakdown,
  audience_top_cities, last_metrics_sync, referral_url, referral_code,
  referral_registrations, referral_deposits_count, referral_deposits_amount,
  referral_currency, referral_updated_at, created_at)
ON public.influencers TO anon;

-- 5. show_contacts: scope to agency staff owning the show
DROP POLICY IF EXISTS "authed read show_contacts" ON public.show_contacts;
DROP POLICY IF EXISTS "authed insert show_contacts" ON public.show_contacts;
DROP POLICY IF EXISTS "authed update show_contacts" ON public.show_contacts;
DROP POLICY IF EXISTS "authed delete show_contacts" ON public.show_contacts;

CREATE POLICY "Agency staff read show_contacts"
ON public.show_contacts FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.shows s
  WHERE s.id = show_contacts.show_id
    AND (
      public.is_super_admin(auth.uid())
      OR (s.agency_id IS NOT NULL AND public.user_has_agency_access(auth.uid(), s.agency_id))
      OR (s.agency_id IS NULL AND EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role IN ('agency_admin','account_manager')))
    )
));

CREATE POLICY "Agency staff insert show_contacts"
ON public.show_contacts FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.shows s
  WHERE s.id = show_contacts.show_id
    AND (
      public.is_super_admin(auth.uid())
      OR (s.agency_id IS NOT NULL AND public.user_has_agency_access(auth.uid(), s.agency_id))
      OR (s.agency_id IS NULL AND EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role IN ('agency_admin','account_manager')))
    )
));

CREATE POLICY "Agency staff update show_contacts"
ON public.show_contacts FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.shows s
  WHERE s.id = show_contacts.show_id
    AND (
      public.is_super_admin(auth.uid())
      OR (s.agency_id IS NOT NULL AND public.user_has_agency_access(auth.uid(), s.agency_id))
      OR (s.agency_id IS NULL AND EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role IN ('agency_admin','account_manager')))
    )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.shows s
  WHERE s.id = show_contacts.show_id
    AND (
      public.is_super_admin(auth.uid())
      OR (s.agency_id IS NOT NULL AND public.user_has_agency_access(auth.uid(), s.agency_id))
      OR (s.agency_id IS NULL AND EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role IN ('agency_admin','account_manager')))
    )
));

CREATE POLICY "Agency staff delete show_contacts"
ON public.show_contacts FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.shows s
  WHERE s.id = show_contacts.show_id
    AND (
      public.is_super_admin(auth.uid())
      OR (s.agency_id IS NOT NULL AND public.user_has_agency_access(auth.uid(), s.agency_id))
      OR (s.agency_id IS NULL AND EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role IN ('agency_admin','account_manager')))
    )
));