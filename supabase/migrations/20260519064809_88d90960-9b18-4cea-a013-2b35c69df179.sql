-- 1. contests can be standalone
ALTER TABLE public.contests ALTER COLUMN campaign_id DROP NOT NULL;
ALTER TABLE public.contests ADD COLUMN IF NOT EXISTS client_id uuid;

-- 2. extend get_contest_by_token to support standalone contests
CREATE OR REPLACE FUNCTION public.get_contest_by_token(_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'hashtag', c.hashtag,
    'platforms', c.platforms,
    'start_date', c.start_date,
    'end_date', c.end_date,
    'prize', c.prize,
    'campaign', CASE WHEN cm.id IS NOT NULL
      THEN jsonb_build_object('id', cm.id, 'name', cm.name)
      ELSE NULL END,
    'client', jsonb_build_object(
      'name', cl.name,
      'logo_url', cl.logo_url
    )
  )
  FROM public.contests c
  LEFT JOIN public.campaigns cm ON cm.id = c.campaign_id
  LEFT JOIN public.clients cl ON cl.id = COALESCE(c.client_id, cm.client_id)
  WHERE c.submission_token = _token AND c.is_active
  LIMIT 1;
$function$;

-- 3. public read of contests + approved entries via the contest's own submission_token
-- (current policies require an active report_link on the parent campaign, which won't exist
-- for standalone contests). Allow public read keyed on contests.is_active alone for the
-- contest row, and approved/winner entries for that contest.
DROP POLICY IF EXISTS "Public reads active contests" ON public.contests;
CREATE POLICY "Public reads active contests"
ON public.contests
FOR SELECT
USING (is_active = true);

DROP POLICY IF EXISTS "Public reads approved entries of active contests" ON public.contest_entries;
CREATE POLICY "Public reads approved entries of active contests"
ON public.contest_entries
FOR SELECT
USING (
  status = ANY (ARRAY['approved'::text, 'winner'::text])
  AND EXISTS (
    SELECT 1 FROM public.contests c
    WHERE c.id = contest_entries.contest_id AND c.is_active = true
  )
);

-- Public read of the client behind a standalone contest (for logo/name on public report)
DROP POLICY IF EXISTS "Public reads clients via active contest" ON public.clients;
CREATE POLICY "Public reads clients via active contest"
ON public.clients
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.contests c
    WHERE c.is_active = true
      AND COALESCE(c.client_id, (SELECT cm.client_id FROM public.campaigns cm WHERE cm.id = c.campaign_id)) = clients.id
  )
);

-- 4. recipients can be scoped to a contest
ALTER TABLE public.report_recipients ALTER COLUMN campaign_id DROP NOT NULL;
ALTER TABLE public.report_recipients ADD COLUMN IF NOT EXISTS contest_id uuid;
ALTER TABLE public.report_recipients
  ADD CONSTRAINT report_recipients_target_chk
  CHECK (campaign_id IS NOT NULL OR contest_id IS NOT NULL);
