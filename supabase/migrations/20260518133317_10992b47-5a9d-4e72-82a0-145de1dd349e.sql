
-- Canonicalize existing contest_entries.post_url and remove duplicates per contest.
WITH canon AS (
  SELECT
    id,
    contest_id,
    COALESCE((shares*3 + comments*2 + likes), 0) AS sc,
    CASE
      WHEN post_url ~* 'tiktok\.com.*(?:/video/|/v/|share_item_id=)([0-9]{6,})'
        THEN 'https://www.tiktok.com/video/' ||
             (regexp_match(post_url, '(?:/video/|/v/|share_item_id=)([0-9]{6,})'))[1]
      WHEN post_url ~* 'instagram\.com/(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)'
        THEN 'https://www.instagram.com/p/' ||
             (regexp_match(post_url, 'instagram\.com/(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)'))[1] || '/'
      ELSE post_url
    END AS canon_url
  FROM contest_entries
  WHERE post_url IS NOT NULL
),
ranked AS (
  SELECT id, contest_id, canon_url, sc,
         ROW_NUMBER() OVER (PARTITION BY contest_id, canon_url ORDER BY sc DESC, id) AS rn
  FROM canon
)
DELETE FROM contest_entries ce
USING ranked r
WHERE ce.id = r.id AND r.rn > 1;

-- Now rewrite remaining rows to their canonical URL.
UPDATE contest_entries ce
SET post_url = c.canon_url
FROM (
  SELECT
    id,
    CASE
      WHEN post_url ~* 'tiktok\.com.*(?:/video/|/v/|share_item_id=)([0-9]{6,})'
        THEN 'https://www.tiktok.com/video/' ||
             (regexp_match(post_url, '(?:/video/|/v/|share_item_id=)([0-9]{6,})'))[1]
      WHEN post_url ~* 'instagram\.com/(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)'
        THEN 'https://www.instagram.com/p/' ||
             (regexp_match(post_url, 'instagram\.com/(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)'))[1] || '/'
      ELSE post_url
    END AS canon_url
  FROM contest_entries
  WHERE post_url IS NOT NULL
) c
WHERE ce.id = c.id AND ce.post_url <> c.canon_url;
