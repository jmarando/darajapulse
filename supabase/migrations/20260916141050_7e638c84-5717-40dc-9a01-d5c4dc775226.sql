
-- 1) Provenance marker for creator country. Additive, nullable-safe.
DO $$ BEGIN
  CREATE TYPE public.geo_source AS ENUM ('defaulted','inferred_campaign','imported','verified');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.influencers        ADD COLUMN IF NOT EXISTS country_source public.geo_source;
ALTER TABLE public.discovery_creators ADD COLUMN IF NOT EXISTS country_source public.geo_source;

-- 2) Mark what the earlier backfill produced. Values themselves are untouched.
UPDATE public.influencers
   SET country_source = 'inferred_campaign'
 WHERE country_source IS NULL AND country_code = 'TZ';

UPDATE public.influencers
   SET country_source = 'defaulted'
 WHERE country_source IS NULL AND country_code IS NOT NULL;

UPDATE public.discovery_creators
   SET country_source = 'defaulted'
 WHERE country_source IS NULL AND country_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS influencers_country_source_idx ON public.influencers (country_source);

-- 3) Reporting: creator location only (no campaign-market substitution) + provenance.
DROP FUNCTION IF EXISTS public.reporting_publications(uuid[], timestamptz, timestamptz);

CREATE FUNCTION public.reporting_publications(
  _campaign_ids uuid[] DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL
)
RETURNS TABLE(
  post_id uuid, deliverable_id uuid, deliverable_title text, deliverable_status text,
  deliverable_content_type text, deliverable_due_date date,
  campaign_id uuid, campaign_name text, campaign_status text, campaign_country text,
  client_id uuid, client_name text,
  influencer_id uuid, influencer_name text, influencer_handle text,
  influencer_country text, influencer_city text, influencer_country_source text,
  platform text, post_url text, caption text, thumbnail_url text, post_status text,
  posted_at timestamptz,
  views numeric, likes numeric, comments numeric, shares numeric, saves numeric,
  reach numeric, impressions numeric, last_synced timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH peak AS (
    SELECT pm.post_id,
           max(pm.views) views, max(pm.likes) likes, max(pm.comments) comments,
           max(pm.shares) shares, max(pm.saves) saves, max(pm.reach) reach,
           max(pm.impressions) impressions, max(pm.captured_at) captured_at
      FROM post_metrics pm GROUP BY pm.post_id
  )
  SELECT p.id, p.deliverable_id, d.title, d.status, d.content_type, d.due_date,
         c.id, c.name, c.status::text, c.country_code,
         cl.id, cl.name,
         i.id, i.full_name, i.handle,
         i.country_code, i.city, i.country_source::text,
         p.platform::text, p.post_url, p.caption, p.thumbnail_url, p.status::text, p.posted_at,
         coalesce(pk.views,0), coalesce(pk.likes,0), coalesce(pk.comments,0), coalesce(pk.shares,0),
         coalesce(pk.saves,0), coalesce(pk.reach,0), coalesce(pk.impressions,0), pk.captured_at
    FROM posts p
    JOIN campaigns c ON c.id = p.campaign_id
    LEFT JOIN clients cl ON cl.id = c.client_id
    LEFT JOIN influencers i ON i.id = p.influencer_id
    LEFT JOIN campaign_deliverables d ON d.id = p.deliverable_id
    LEFT JOIN peak pk ON pk.post_id = p.id
   WHERE (_campaign_ids IS NULL OR c.id = ANY(_campaign_ids))
     AND (_from IS NULL OR p.posted_at >= _from)
     AND (_to IS NULL OR p.posted_at <= _to)
     AND (public.agency_staff_on_campaign(auth.uid(), c.id) OR public.user_has_campaign_access(auth.uid(), c.id))
$$;

REVOKE ALL ON FUNCTION public.reporting_publications(uuid[], timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reporting_publications(uuid[], timestamptz, timestamptz) TO authenticated;
