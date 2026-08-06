
CREATE OR REPLACE FUNCTION public.get_creator_draft_state(_brief_token text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'required', COALESCE(c.require_draft_approval, false),
    'drafts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id,
        'file_name', d.file_name,
        'platform', d.platform,
        'status', d.status,
        'review_note', d.review_note,
        'created_at', d.created_at,
        'reviewed_at', d.reviewed_at,
        'post_url', d.post_url
      ) ORDER BY d.created_at DESC)
      FROM public.creator_drafts d
      WHERE d.campaign_influencer_id = ci.id
    ), '[]'::jsonb),
    'approved_available', EXISTS (
      SELECT 1 FROM public.creator_drafts d
      WHERE d.campaign_influencer_id = ci.id AND d.status = 'approved' AND d.post_url IS NULL
    )
  )
  FROM public.campaign_influencers ci
  JOIN public.campaigns c ON c.id = ci.campaign_id
  WHERE ci.brief_token = _brief_token
  LIMIT 1;
$$;
