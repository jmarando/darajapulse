CREATE OR REPLACE FUNCTION public.get_report_public_data(_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _cid uuid; _res jsonb;
BEGIN
  _cid := public.get_report_link_campaign(_token);
  IF _cid IS NULL THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'influencers', COALESCE((SELECT jsonb_agg(to_jsonb(ci) || jsonb_build_object('influencers',
        (SELECT jsonb_build_object('id',i.id,'full_name',i.full_name,'handle',i.handle,'primary_platform',i.primary_platform,'niche',i.niche,'region',i.region,'follower_count',i.follower_count,'engagement_rate',i.engagement_rate,'avg_cpm_kes',i.avg_cpm_kes,'audience_kenya_pct',i.audience_kenya_pct,'authenticity_score',i.authenticity_score,'avatar_url',i.avatar_url,'alt_handles',i.alt_handles)
         FROM public.influencers i WHERE i.id = ci.influencer_id)))
      FROM public.campaign_influencers ci WHERE ci.campaign_id = _cid), '[]'::jsonb),
    'entries', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.id,'contest_id',e.contest_id,'influencer_id',e.influencer_id,'platform',e.platform,'post_url',e.post_url,'handle',e.handle,'caption',e.caption,'thumbnail_url',e.thumbnail_url,'posted_at',e.posted_at,'views',e.views,'likes',e.likes,'comments',e.comments,'shares',e.shares,'saves',e.saves,'score',e.score,'round_number',e.round_number,'status',e.status,'source',e.source,'submitter_name',e.submitter_name,'full_name',e.full_name,'instagram_handle',e.instagram_handle,'tiktok_handle',e.tiktok_handle,'facebook_handle',e.facebook_handle,'cross_posts',e.cross_posts,'metadata',e.metadata,'created_at',e.created_at) ORDER BY e.score DESC NULLS LAST)
      FROM public.contest_entries e JOIN public.contests c ON c.id = e.contest_id WHERE c.campaign_id = _cid), '[]'::jsonb)
  ) INTO _res;
  RETURN _res;
END $$;
GRANT EXECUTE ON FUNCTION public.get_report_public_data(text) TO anon, authenticated;