-- Deduplicate report_links: keep oldest active row per campaign, drop the rest.
WITH ranked AS (
  SELECT id, campaign_id,
         row_number() OVER (PARTITION BY campaign_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.report_links
)
DELETE FROM public.report_links rl
USING ranked r
WHERE rl.id = r.id AND r.rn > 1;

-- Prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS report_links_campaign_unique
  ON public.report_links(campaign_id);