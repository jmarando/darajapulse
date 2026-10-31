-- Checks for 20261103090000_groundwork_link.sql (the Groundwork link).
-- Paste inside the dry-run DO block, after EXECUTE of the migration text and before the final
-- RAISE EXCEPTION 'ROLLED_BACK: all checks passed'. Every scratch row rolls back with the block.
-- It never reads the job key itself, only that a row exists and how long its key is.
DECLARE
  _agency uuid := gen_random_uuid();
  _client uuid := gen_random_uuid();
  _camp1 uuid := gen_random_uuid();
  _camp2 uuid := gen_random_uuid();
  _camp3 uuid := gen_random_uuid();
  _gw1 uuid := gen_random_uuid();
  _gw2 uuid := gen_random_uuid();
  _gw3 uuid := gen_random_uuid();
  _prospect uuid;
  _ok boolean;
  _n int;
  _row record;
BEGIN
  -- 0. The job key row is there and the key is a real one; nothing that exists today became political.
  SELECT count(*) INTO _n FROM public.internal_job_keys WHERE name = 'groundwork';
  IF _n <> 1 THEN RAISE EXCEPTION 'the groundwork job key row is missing (% rows)', _n; END IF;
  SELECT length(key) INTO _n FROM public.internal_job_keys WHERE name = 'groundwork';
  IF _n < 32 THEN RAISE EXCEPTION 'the groundwork job key is only % characters', _n; END IF;
  SELECT count(*) INTO _n FROM public.campaigns WHERE political;
  IF _n <> 0 THEN RAISE EXCEPTION '% existing campaigns are political', _n; END IF;

  -- Scratch agency, client and campaigns. The second campaign leaves political at its default.
  INSERT INTO public.agencies (id, name, slug) VALUES (_agency, 'Verify groundwork link', 'verify-groundwork-' || left(_agency::text, 8));
  INSERT INTO public.clients (id, name, agency_id) VALUES (_client, 'Verify client', _agency);
  INSERT INTO public.campaigns (id, client_id, name, agency_id, political, paid_for_by)
    VALUES (_camp1, _client, 'Verify campaign one', _agency, true, 'Paid for by the Verify Friends');
  INSERT INTO public.campaigns (id, client_id, name, agency_id) VALUES (_camp2, _client, 'Verify campaign two', _agency);
  INSERT INTO public.campaigns (id, client_id, name, agency_id) VALUES (_camp3, _client, 'Verify campaign three', _agency);
  SELECT political, paid_for_by INTO _row FROM public.campaigns WHERE id = _camp2;
  IF _row.political IS DISTINCT FROM false OR _row.paid_for_by IS NOT NULL THEN
    RAISE EXCEPTION 'a campaign made without the new columns is not (false, null): %', _row;
  END IF;

  -- 1. One Groundwork campaign, one Pulse campaign; deleting the campaign removes the link.
  INSERT INTO public.groundwork_links (groundwork_campaign_id, campaign_id, client_id, agency_id) VALUES (_gw1, _camp1, _client, _agency);
  _ok := false;
  BEGIN
    INSERT INTO public.groundwork_links (groundwork_campaign_id, campaign_id, client_id, agency_id) VALUES (_gw1, _camp2, _client, _agency);
  EXCEPTION WHEN unique_violation THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'one Groundwork campaign was linked to two Pulse campaigns'; END IF;
  _ok := false;
  BEGIN
    INSERT INTO public.groundwork_links (groundwork_campaign_id, campaign_id, client_id, agency_id) VALUES (_gw2, _camp1, _client, _agency);
  EXCEPTION WHEN unique_violation THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'two Groundwork campaigns were linked to one Pulse campaign'; END IF;
  INSERT INTO public.groundwork_links (groundwork_campaign_id, campaign_id, client_id, agency_id) VALUES (_gw3, _camp3, _client, _agency);
  DELETE FROM public.campaigns WHERE id = _camp3;
  SELECT count(*) INTO _n FROM public.groundwork_links WHERE groundwork_campaign_id = _gw3;
  IF _n <> 0 THEN RAISE EXCEPTION 'the link outlived its campaign'; END IF;

  -- 2. A prospect starts approached; a repeat of the same account is refused (the function updates instead).
  -- It is filed with an old updated_at because now() does not move inside one transaction: section 4 then
  -- shows the trigger stamping it.
  INSERT INTO public.groundwork_prospects (agency_id, campaign_id, platform, handle, name, url, followers, invitation, why, paid_for_by, updated_at)
    VALUES (_agency, _camp1, 'x', 'example_one', 'Example One', 'https://x.com/example_one', 48200, 'Hello', ARRAY['48,200 followers'], 'Paid for by the Verify Friends', timestamptz '2000-01-01')
    RETURNING id INTO _prospect;
  SELECT status INTO _row FROM public.groundwork_prospects WHERE id = _prospect;
  IF _row.status <> 'approached' THEN RAISE EXCEPTION 'a new prospect is % and not approached', _row.status; END IF;
  _ok := false;
  BEGIN
    INSERT INTO public.groundwork_prospects (agency_id, campaign_id, platform, handle, paid_for_by)
      VALUES (_agency, _camp1, 'x', 'example_one', 'Paid for by the Verify Friends');
  EXCEPTION WHEN unique_violation THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'the same account was filed twice for one campaign'; END IF;

  -- 3. The table keeps its own rules: the four status words, one plain handle, https links, no negative followers.
  _ok := false;
  BEGIN
    INSERT INTO public.groundwork_prospects (agency_id, campaign_id, platform, handle, paid_for_by, status)
      VALUES (_agency, _camp1, 'x', 'example_two', 'Paid for by the Verify Friends', 'maybe');
  EXCEPTION WHEN check_violation THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'the status "maybe" was accepted'; END IF;
  _ok := false;
  BEGIN
    INSERT INTO public.groundwork_prospects (agency_id, campaign_id, platform, handle, paid_for_by)
      VALUES (_agency, _camp1, 'x', 'Example_Two', 'Paid for by the Verify Friends');
  EXCEPTION WHEN check_violation THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'a handle with capitals was accepted'; END IF;
  _ok := false;
  BEGIN
    INSERT INTO public.groundwork_prospects (agency_id, campaign_id, platform, handle, paid_for_by)
      VALUES (_agency, _camp1, 'x', '@example_two', 'Paid for by the Verify Friends');
  EXCEPTION WHEN check_violation THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'a handle with an @ was accepted'; END IF;
  _ok := false;
  BEGIN
    INSERT INTO public.groundwork_prospects (agency_id, campaign_id, platform, handle, paid_for_by, url)
      VALUES (_agency, _camp1, 'x', 'example_two', 'Paid for by the Verify Friends', 'http://x.com/example_two');
  EXCEPTION WHEN check_violation THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'a link that is not https was accepted'; END IF;
  _ok := false;
  BEGIN
    INSERT INTO public.groundwork_prospects (agency_id, campaign_id, platform, handle, paid_for_by, followers)
      VALUES (_agency, _camp1, 'x', 'example_two', 'Paid for by the Verify Friends', -1);
  EXCEPTION WHEN check_violation THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'a negative follower count was accepted'; END IF;

  -- 4. A status moves and the trigger stamps the row; deleting the campaign takes its prospects with it.
  UPDATE public.groundwork_prospects SET status = 'on_roster' WHERE id = _prospect;
  SELECT status, updated_at INTO _row FROM public.groundwork_prospects WHERE id = _prospect;
  IF _row.status <> 'on_roster' OR _row.updated_at <= timestamptz '2000-01-01' THEN
    RAISE EXCEPTION 'the status did not move, or updated_at was not stamped: %', _row;
  END IF;
  DELETE FROM public.campaigns WHERE id = _camp1;
  SELECT count(*) INTO _n FROM public.groundwork_prospects WHERE id = _prospect;
  IF _n <> 0 THEN RAISE EXCEPTION 'a prospect outlived its campaign'; END IF;

  -- 5. Row security is on with no policy, the public roles have nothing, the service role has everything.
  SELECT count(*) INTO _n FROM pg_class
   WHERE oid IN ('public.groundwork_links'::regclass, 'public.groundwork_prospects'::regclass) AND relrowsecurity;
  IF _n <> 2 THEN RAISE EXCEPTION 'row security is on for % of 2 tables', _n; END IF;
  SELECT count(*) INTO _n FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('groundwork_links', 'groundwork_prospects');
  IF _n <> 0 THEN RAISE EXCEPTION '% policies exist on the link tables', _n; END IF;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  _ok := false;
  BEGIN PERFORM 1 FROM public.groundwork_links LIMIT 1; EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'anon can read groundwork_links'; END IF;
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  _ok := false;
  BEGIN PERFORM 1 FROM public.groundwork_prospects LIMIT 1; EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'a signed-in user can read groundwork_prospects'; END IF;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO _n FROM public.groundwork_links WHERE groundwork_campaign_id = _gw1;
  SELECT count(*) INTO _n FROM public.groundwork_prospects;
  RESET ROLE;
END;
