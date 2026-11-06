-- Checks 20261111090000_stories_creator_submissions.sql. Run after applying it. Ends in RAISE EXCEPTION, so nothing it writes is
-- kept; the message "stories checks passed" is the pass.
DO $$
DECLARE
  _c uuid;
  _i uuid;
  _pred text;
  _cols text;
  _ai text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_index WHERE indexname = 'stories_external_uniq') THEN
    RAISE EXCEPTION 'FAILED: stories_external_uniq should be dropped';
  END IF;
  SELECT i.indpred::text, i.indkey::text INTO _pred, _cols
  FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
  WHERE i.indrelid = 'public.stories'::regclass AND c.relname = 'stories_campaign_frame_uniq';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAILED: stories_campaign_frame_uniq should exist';
  END IF;
  IF _pred IS NOT NULL AND _pred <> '' THEN
    RAISE EXCEPTION 'FAILED: stories_campaign_frame_uniq should not be partial, found predicate %', _pred;
  END IF;
  SELECT t.attname INTO _ai FROM pg_attribute t
  WHERE t.attrelid = 'public.stories'::regclass AND t.attname = 'ai_reading';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAILED: stories.ai_reading should exist';
  END IF;

  SELECT id INTO _c FROM public.campaigns LIMIT 1;
  SELECT id INTO _i FROM public.influencers LIMIT 1;
  IF _c IS NULL OR _i IS NULL THEN
    RAISE EXCEPTION 'FAILED: need one campaign and one influencer to check the index';
  END IF;

  -- One frame can count on two campaigns: the same external_id under a second campaign must not clash.
  INSERT INTO public.stories (campaign_id, influencer_id, platform, external_id, source, verified)
  VALUES (_c, _i, 'instagram', 'verify-frame-1', 'instagram_api', true);
  -- Retried sync of the same frame on the same campaign must hit the unique index (ON CONFLICT can infer it).
  BEGIN
    INSERT INTO public.stories (campaign_id, influencer_id, platform, external_id, source, verified)
    VALUES (_c, _i, 'instagram', 'verify-frame-1', 'instagram_api', true)
    ON CONFLICT (campaign_id, platform, external_id) DO UPDATE SET verified = EXCLUDED.verified;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAILED: ON CONFLICT (campaign_id,platform,external_id) could not infer the index: %', SQLERRM;
  END;
  -- Rows with no external_id (staff manual, creator submissions) never clash, because NULLs are distinct.
  INSERT INTO public.stories (campaign_id, influencer_id, platform, source, verified)
  VALUES (_c, _i, 'instagram', 'manual', true), (_c, _i, 'instagram', 'creator', false);
  -- The AI reading round-trips separately from the row numbers.
  INSERT INTO public.stories (campaign_id, influencer_id, platform, reach, ai_reading, source, verified)
  VALUES (_c, _i, 'instagram', 4100, '{"reach":4200,"views":5100,"model":"test","read_at":"2026-11-06T00:00:00Z"}'::jsonb, 'creator', false);
  IF (SELECT ai_reading #>> '{reach}' FROM public.stories WHERE source = 'creator' ORDER BY created_at DESC LIMIT 1) <> '4200' THEN
    RAISE EXCEPTION 'FAILED: ai_reading did not round trip';
  END IF;
  RAISE EXCEPTION 'stories checks passed';
END $$;
