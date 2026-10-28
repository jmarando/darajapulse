-- The payments summary link read every post's latest figures by walking all of post_metrics.
--
-- Why: get_payments_public_data() took each post's newest snapshot with
-- SELECT DISTINCT ON (post_id) ... FROM post_metrics JOIN posts ... ORDER BY post_id, captured_at DESC.
-- Postgres answered that with a merge join over the whole (post_id, captured_at DESC) index:
-- 363,608 entries and about 323,000 buffer reads to return the 827 rows of the Royco KE Q3 Nano
-- campaign (5,213 snapshots). In production the call averaged about 590 ms over about 5,300 calls
-- (standard deviation 629 ms, worst 3,000 ms, which is the anon role's statement timeout), and it is the
-- third biggest user of database time since the statistics were last reset (28 Aug). Every open
-- copy of the page asks again each minute. When the database was busy the call was cancelled, the
-- page got an error, and it showed "Payments summary not found" for a link that was fine.
--
-- What: look each post's newest snapshot up with one index probe per post, the same approach
-- get_report_post_metrics was given in 20261023091500. Only the 'metrics' part changes; the other
-- five parts, the signature, SECURITY DEFINER, search_path and grants are as they were.
--
-- Measured on the live data, inside a transaction that was rolled back:
--   the subquery alone      323,163 buffer reads, 295 ms  ->  3,560 buffer reads, 21 ms
--   the whole function      281 to 338 ms per call        ->  19 to 31 ms per call (19 ms as anon)
--   the result              identical json, byte for byte (402,729 bytes, 827 metric rows, same order)
--   old and new subquery    identical rows, in both directions, for all 1,953 posts that have readings
--                           (no two snapshots of a post share a captured_at, so "newest" is unambiguous)
--   an unknown token        NULL, as before
--
-- To roll back: re-create the function from 20261005124500_52972918-9e39-470c-9b77-2002f317bb59.sql.

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
        SELECT lm.post_id, lm.views, lm.reach, lm.captured_at
        FROM public.posts p
        CROSS JOIN LATERAL (
          SELECT m.post_id, m.views, m.reach, m.captured_at
          FROM public.post_metrics m
          WHERE m.post_id = p.id
          ORDER BY m.captured_at DESC
          LIMIT 1
        ) lm
        WHERE p.campaign_id = _cid
        ORDER BY lm.post_id
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
