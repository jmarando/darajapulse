WITH roster AS (
  SELECT i.id, i.handle, i.full_name, i.alt_handles
  FROM public.campaign_influencers ci
  JOIN public.influencers i ON i.id = ci.influencer_id
  WHERE ci.campaign_id IN (SELECT id FROM public.campaigns WHERE name ILIKE 'Royco KE Q3%')
),
norm AS (
  SELECT r.id,
         lower(regexp_replace(coalesce(r.handle,''), '[^a-z0-9]', '', 'gi')) AS nh,
         lower(trim(coalesce(r.full_name,''))) AS nn
  FROM roster r
),
ent AS (
  SELECT e.full_name, e.handle, e.instagram_handle, e.tiktok_handle, e.facebook_handle
  FROM public.contest_entries e
  WHERE e.contest_id IN (SELECT id FROM public.contests WHERE name ILIKE '%Taste Paradise%')
),
matched AS (
  SELECT n.id, e.instagram_handle, e.tiktok_handle, e.facebook_handle
  FROM norm n
  JOIN ent e ON (
      lower(trim(coalesce(e.full_name,''))) = n.nn AND n.nn <> ''
   OR lower(regexp_replace(coalesce(e.handle,''), '[^a-z0-9]', '', 'gi')) = n.nh
   OR lower(regexp_replace(coalesce(e.instagram_handle,''), '[^a-z0-9]', '', 'gi')) = n.nh
   OR lower(regexp_replace(coalesce(e.tiktok_handle,''), '[^a-z0-9]', '', 'gi')) = n.nh
   OR lower(regexp_replace(coalesce(e.facebook_handle,''), '[^a-z0-9]', '', 'gi')) = n.nh
  )
),
agg AS (
  SELECT id,
    (SELECT max(x) FROM (SELECT trim(leading '@' from instagram_handle) x FROM matched m2 WHERE m2.id = m.id AND nullif(trim(m2.instagram_handle),'') IS NOT NULL) s) AS ig,
    (SELECT max(x) FROM (SELECT trim(leading '@' from tiktok_handle) x FROM matched m2 WHERE m2.id = m.id AND nullif(trim(m2.tiktok_handle),'') IS NOT NULL) s) AS tt,
    (SELECT max(x) FROM (SELECT trim(leading '@' from facebook_handle) x FROM matched m2 WHERE m2.id = m.id AND nullif(trim(m2.facebook_handle),'') IS NOT NULL) s) AS fb
  FROM matched m
  GROUP BY id
)
UPDATE public.influencers i
SET alt_handles = (
  SELECT array_agg(DISTINCT v) FROM unnest(
    array_remove(ARRAY[
      CASE WHEN a.ig IS NOT NULL THEN 'instagram:' || a.ig END,
      CASE WHEN a.tt IS NOT NULL THEN 'tiktok:' || a.tt END,
      CASE WHEN a.fb IS NOT NULL THEN 'facebook:' || a.fb END
    ], NULL) || coalesce(i.alt_handles, ARRAY[]::text[])
  ) v
)
FROM agg a
WHERE i.id = a.id
  AND (a.ig IS NOT NULL OR a.tt IS NOT NULL OR a.fb IS NOT NULL);