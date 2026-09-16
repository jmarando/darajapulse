
CREATE OR REPLACE FUNCTION public.reporting_publications(_campaign_ids uuid[] DEFAULT NULL, _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL)
RETURNS TABLE (
  post_id uuid,
  deliverable_id uuid,
  deliverable_title text,
  deliverable_status text,
  deliverable_content_type text,
  deliverable_due_date date,
  campaign_id uuid,
  campaign_name text,
  campaign_status text,
  client_id uuid,
  client_name text,
  influencer_id uuid,
  influencer_name text,
  influencer_handle text,
  platform text,
  post_url text,
  caption text,
  thumbnail_url text,
  post_status text,
  posted_at timestamptz,
  views numeric,
  likes numeric,
  comments numeric,
  shares numeric,
  saves numeric,
  reach numeric,
  impressions numeric,
  last_synced timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.deliverable_id,
    d.title,
    d.status,
    d.content_type,
    d.due_date,
    c.id,
    c.name,
    c.status::text,
    cl.id,
    cl.name,
    i.id,
    i.full_name,
    i.handle,
    p.platform::text,
    p.post_url,
    p.caption,
    p.thumbnail_url,
    p.status::text,
    coalesce(p.posted_at, p.created_at),
    m.views, m.likes, m.comments, m.shares, m.saves, m.reach, m.impressions,
    m.captured_at
  FROM public.posts p
  JOIN public.campaigns c ON c.id = p.campaign_id
  LEFT JOIN public.clients cl ON cl.id = c.client_id
  LEFT JOIN public.influencers i ON i.id = p.influencer_id
  LEFT JOIN public.campaign_deliverables d ON d.id = p.deliverable_id
  LEFT JOIN LATERAL (
    SELECT max(pm.views) views, max(pm.likes) likes, max(pm.comments) comments,
           max(pm.shares) shares, max(pm.saves) saves, max(pm.reach) reach,
           max(pm.impressions) impressions, max(pm.captured_at) captured_at
    FROM public.post_metrics pm WHERE pm.post_id = p.id
  ) m ON true
  WHERE (_campaign_ids IS NULL OR p.campaign_id = ANY(_campaign_ids))
    AND (_from IS NULL OR coalesce(p.posted_at, p.created_at) >= _from)
    AND (_to IS NULL OR coalesce(p.posted_at, p.created_at) <= _to)
    AND public.user_has_campaign_access(auth.uid(), p.campaign_id)
$$;

REVOKE ALL ON FUNCTION public.reporting_publications(uuid[], timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reporting_publications(uuid[], timestamptz, timestamptz) TO authenticated;
