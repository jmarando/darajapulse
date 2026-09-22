CREATE OR REPLACE FUNCTION public.get_public_discovery_showcase(
  _country_code text DEFAULT NULL,
  _city text DEFAULT NULL,
  _limit integer DEFAULT 500,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  full_name text,
  handle text,
  platform text,
  profile_url text,
  niche text[],
  city text,
  country_code text,
  follower_count integer,
  engagement_rate numeric,
  bio text,
  avatar_url text,
  verified_at timestamp with time zone,
  person_key text,
  public_contacts jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dc.id,
    dc.full_name,
    dc.handle,
    dc.platform,
    dc.profile_url,
    dc.niche,
    dc.city,
    dc.country_code,
    COALESCE(dc.follower_count, 0) AS follower_count,
    COALESCE(dc.engagement_rate, 0) AS engagement_rate,
    dc.bio,
    dc.avatar_url,
    dc.verified_at,
    dc.person_key,
    COALESCE(
      jsonb_agg(
        DISTINCT jsonb_build_object(
          'kind', dct.kind,
          'value', dct.value,
          'label', dct.label
        )
      ) FILTER (WHERE dct.id IS NOT NULL),
      '[]'::jsonb
    ) AS public_contacts
  FROM public.discovery_creators dc
  LEFT JOIN public.discovery_contacts dct
    ON dct.creator_id = dc.id
    AND dct.is_public = true
    AND dct.kind IN ('link', 'email', 'manager_email')
  WHERE dc.profile_status = 'active'
    AND COALESCE(dc.link_status, 'ok') <> 'broken'
    AND (_country_code IS NULL OR dc.country_code = _country_code)
    AND (_city IS NULL OR dc.city = _city)
  GROUP BY dc.id
  ORDER BY COALESCE(dc.follower_count, 0) DESC, dc.full_name ASC, dc.id ASC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 500), 1), 500)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
$$;

GRANT EXECUTE ON FUNCTION public.get_public_discovery_showcase(text, text, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_discovery_showcase(text, text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_discovery_showcase_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT platform, country_code, city, niche, COALESCE(follower_count, 0) AS follower_count
    FROM public.discovery_creators
    WHERE profile_status = 'active'
      AND COALESCE(link_status, 'ok') <> 'broken'
  ),
  people AS (
    SELECT COUNT(*) AS people_count
    FROM (
      SELECT DISTINCT COALESCE(NULLIF(person_key, ''), lower(regexp_replace(full_name, '[^a-zA-Z0-9]+', '-', 'g')), id::text) AS k
      FROM public.discovery_creators
      WHERE profile_status = 'active'
        AND COALESCE(link_status, 'ok') <> 'broken'
    ) s
  ),
  niche_rows AS (
    SELECT DISTINCT lower(trim(n)) AS niche
    FROM base, unnest(COALESCE(base.niche, ARRAY[]::text[])) n
    WHERE trim(n) <> ''
  )
  SELECT jsonb_build_object(
    'profiles', (SELECT COUNT(*) FROM base),
    'people', (SELECT people_count FROM people),
    'total_followers', (SELECT COALESCE(SUM(follower_count), 0) FROM base),
    'platforms', COALESCE((SELECT jsonb_object_agg(platform, ct) FROM (SELECT platform, COUNT(*) AS ct FROM base GROUP BY platform ORDER BY platform) p), '{}'::jsonb),
    'countries', COALESCE((SELECT jsonb_object_agg(country_code, ct) FROM (SELECT country_code, COUNT(*) AS ct FROM base WHERE country_code IS NOT NULL GROUP BY country_code ORDER BY country_code) c), '{}'::jsonb),
    'cities', COALESCE((SELECT jsonb_agg(city ORDER BY city) FROM (SELECT DISTINCT city FROM base WHERE city IS NOT NULL AND city <> '') ci), '[]'::jsonb),
    'niches', COALESCE((SELECT jsonb_agg(niche ORDER BY niche) FROM niche_rows), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_public_discovery_showcase_stats() TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_discovery_showcase_stats() TO authenticated;