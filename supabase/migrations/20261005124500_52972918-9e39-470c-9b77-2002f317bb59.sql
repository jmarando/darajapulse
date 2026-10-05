CREATE OR REPLACE FUNCTION public.get_payments_public_data(_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _cid uuid; _res jsonb;
BEGIN
  _cid := public.get_payment_link_campaign(_token);
  IF _cid IS NULL THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'campaign', (SELECT jsonb_build_object('id', c.id, 'name', c.name, 'hashtag', c.hashtag, 'status', c.status,
        'client_name', cl.name, 'client_logo_url', cl.logo_url, 'wht_percent', c.wht_percent)
      FROM public.campaigns c LEFT JOIN public.clients cl ON cl.id = c.client_id WHERE c.id = _cid),
    'creators', COALESCE((SELECT jsonb_agg(jsonb_build_object('campaign_influencer_id', ci.id, 'influencer_id', i.id,
        'full_name', i.full_name, 'handle', i.handle, 'fee_kes', ci.fee_kes, 'deliverables_count', ci.deliverables_count)
        ORDER BY i.full_name)
      FROM public.campaign_influencers ci
      JOIN public.influencers i ON i.id = ci.influencer_id
      WHERE ci.campaign_id = _cid
        AND EXISTS (SELECT 1 FROM public.contract_signatures s WHERE s.campaign_influencer_id = ci.id)), '[]'::jsonb),
    'posts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'influencer_id', p.influencer_id,
        'platform', p.platform, 'post_url', p.post_url, 'posted_at', p.posted_at) ORDER BY p.posted_at NULLS LAST)
      FROM public.posts p WHERE p.campaign_id = _cid), '[]'::jsonb),
    'metrics', COALESCE((SELECT jsonb_agg(to_jsonb(l)) FROM (
        SELECT DISTINCT ON (m.post_id) m.post_id, m.views, m.reach, m.captured_at
        FROM public.post_metrics m
        JOIN public.posts p ON p.id = m.post_id
        WHERE p.campaign_id = _cid
        ORDER BY m.post_id, m.captured_at DESC
      ) l), '[]'::jsonb),
    'drafts', COALESCE((SELECT jsonb_agg(jsonb_build_object('influencer_id', d.influencer_id, 'post_url', d.post_url))
      FROM public.creator_drafts d WHERE d.campaign_id = _cid AND d.status = 'approved' AND d.post_url IS NOT NULL), '[]'::jsonb),
    'payouts', COALESCE((SELECT jsonb_agg(jsonb_build_object('influencer_id', po.influencer_id, 'status', po.status,
        'gross_kes', po.gross_kes, 'net_kes', po.net_kes, 'mpesa_ref', po.mpesa_ref))
      FROM public.payouts po WHERE po.campaign_id = _cid), '[]'::jsonb)
  ) INTO _res;
  RETURN _res;
END $$;
GRANT EXECUTE ON FUNCTION public.get_payments_public_data(text) TO anon, authenticated;