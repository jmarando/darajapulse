ALTER TABLE public.discovery_creators
  ADD COLUMN IF NOT EXISTS link_status text NOT NULL DEFAULT 'unvalidated',
  ADD COLUMN IF NOT EXISTS link_reason text,
  ADD COLUMN IF NOT EXISTS link_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_profile_url text;

-- Preserve the original provider/import URL exactly once.
UPDATE public.discovery_creators
SET source_profile_url = profile_url
WHERE source_profile_url IS NULL AND profile_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discovery_creators_link_status
  ON public.discovery_creators (link_status);

-- 1) No usable link supplied.
UPDATE public.discovery_creators
SET link_status = 'missing_url',
    link_reason = 'No profile link was supplied by the source',
    link_checked_at = now()
WHERE profile_url IS NULL OR btrim(profile_url) = '';

-- 2) Handle is a YouTube channel ID but the record is not a YouTube record.
UPDATE public.discovery_creators
SET link_status = 'platform_mismatch',
    link_reason = 'Identifier is a YouTube channel ID but the record is labelled ' || platform,
    link_checked_at = now()
WHERE platform <> 'youtube'
  AND (handle ~* '^uc[a-z0-9_-]{20,24}$'
       OR profile_url ~* '/uc[a-z0-9_-]{20,24}/?$');

-- 3) Link host does not belong to the record's platform.
UPDATE public.discovery_creators
SET link_status = 'platform_mismatch',
    link_reason = 'Profile link does not point to ' || platform,
    link_checked_at = now()
WHERE link_status = 'unvalidated'
  AND profile_url IS NOT NULL
  AND (
    (platform = 'instagram' AND profile_url !~* '(^|//|\.)instagram\.com/')
 OR (platform = 'tiktok'    AND profile_url !~* '(^|//|\.)tiktok\.com/')
 OR (platform = 'youtube'   AND profile_url !~* '(^|//|\.)(youtube\.com|youtu\.be)/')
 OR (platform = 'facebook'  AND profile_url !~* '(^|//|\.)(facebook\.com|fb\.com)/')
 OR (platform = 'twitter'   AND profile_url !~* '(^|//|\.)(twitter\.com|x\.com)/')
  );

-- 4) Everything else that has a link passes the structural check.
UPDATE public.discovery_creators
SET link_status = 'valid',
    link_reason = NULL,
    link_checked_at = now()
WHERE link_status = 'unvalidated' AND profile_url IS NOT NULL AND btrim(profile_url) <> '';