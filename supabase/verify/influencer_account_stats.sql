-- Checks 20261110090000_influencer_account_stats.sql. Run after applying it. Ends in RAISE EXCEPTION, so nothing it writes is
-- kept; the message "account_stats checks passed" is the pass.
DO $$
DECLARE
  _id uuid;
  _before bigint;
BEGIN
  IF (SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'influencers' AND column_name = 'account_stats') <> 'NO' THEN
    RAISE EXCEPTION 'FAILED: account_stats should be NOT NULL';
  END IF;
  IF has_column_privilege('anon', 'public.influencers', 'account_stats', 'select') THEN
    RAISE EXCEPTION 'FAILED: anon should not read account_stats';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.influencers', 'account_stats', 'select') THEN
    RAISE EXCEPTION 'FAILED: staff should read account_stats';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.influencers', 'account_stats', 'update') THEN
    RAISE EXCEPTION 'FAILED: staff should write account_stats';
  END IF;
  SELECT count(*) INTO _before FROM public.influencers WHERE account_stats <> '{}'::jsonb;
  IF _before <> 0 AND current_setting('verify.expect_empty', true) = 'yes' THEN
    RAISE EXCEPTION 'FAILED: a fresh column should be empty, found %', _before;
  END IF;
  INSERT INTO public.influencers (full_name, agency_id, handle, primary_platform, alt_handles, account_stats)
  SELECT 'Verify Only', id, 'verifyonly', 'tiktok', ARRAY['instagram:verify.ig'], '{"instagram:verify.ig":{"followers":800,"engagement_rate":null}}'::jsonb
  FROM public.agencies LIMIT 1
  RETURNING id INTO _id;
  IF (SELECT account_stats #>> '{instagram:verify.ig,followers}' FROM public.influencers WHERE id = _id) <> '800' THEN
    RAISE EXCEPTION 'FAILED: numbers did not round trip';
  END IF;
  RAISE EXCEPTION 'account_stats checks passed';
END $$;
