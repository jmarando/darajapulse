-- Checks for 20261106090000_brand_channels.sql (brand channels and public numbers).
-- Paste inside the dry-run DO block, after EXECUTE of the migration text and before the final
-- RAISE EXCEPTION 'ROLLED_BACK: all checks passed'. Every scratch row rolls back with the block.
-- It reads one real agency admin's id and one real portal user's id to act as them, and never prints them.
-- It never reads the job key itself, only that a row exists and how long its key is.
DECLARE
  _agency_a uuid;
  _admin uuid;
  _portal uuid;
  _agency_b uuid := gen_random_uuid();
  _client_a uuid := gen_random_uuid();
  _client_b uuid := gen_random_uuid();
  _chan_a uuid := gen_random_uuid();
  _chan_b uuid := gen_random_uuid();
  _snap uuid := gen_random_uuid();
  _late uuid := gen_random_uuid();
  _edge_in uuid := gen_random_uuid();
  _edge_out uuid := gen_random_uuid();
  _prev uuid := gen_random_uuid();
  _none uuid := gen_random_uuid();
  _doc jsonb;
  _row jsonb;
  _n int;
  _ok boolean;
BEGIN
  -- 0. The job key row is there and the key is a real one; the night's window is scheduled.
  SELECT count(*) INTO _n FROM public.internal_job_keys WHERE name = 'brand-channels-sync';
  IF _n <> 1 THEN RAISE EXCEPTION 'the brand-channels-sync job key row is missing (% rows)', _n; END IF;
  SELECT length(key) INTO _n FROM public.internal_job_keys WHERE name = 'brand-channels-sync';
  IF _n < 32 THEN RAISE EXCEPTION 'the brand-channels-sync job key is only % characters', _n; END IF;
  SELECT count(*) INTO _n FROM cron.job WHERE jobname = 'brand-channels-sync-nightly' AND schedule = '*/15 1-2 * * *' AND active;
  IF _n <> 1 THEN RAISE EXCEPTION 'brand-channels-sync-nightly is not scheduled (% jobs)', _n; END IF;

  -- 1. Row security is on everywhere, anon reaches nothing, and only the service role reaches the allowance.
  SELECT count(*) INTO _n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
   WHERE s.nspname = 'public' AND c.relrowsecurity
     AND c.relname IN ('brand_channels', 'brand_channel_days', 'brand_posts', 'brand_post_metrics', 'brand_pull_credits');
  IF _n <> 5 THEN RAISE EXCEPTION 'row security is on for % of the 5 tables', _n; END IF;
  IF has_table_privilege('anon', 'public.brand_channels', 'SELECT') OR has_table_privilege('anon', 'public.brand_posts', 'SELECT')
     OR has_table_privilege('anon', 'public.brand_post_metrics', 'SELECT') OR has_table_privilege('anon', 'public.brand_channel_days', 'SELECT') THEN
    RAISE EXCEPTION 'anon can read a brand channel table';
  END IF;
  IF has_table_privilege('authenticated', 'public.brand_pull_credits', 'SELECT') THEN RAISE EXCEPTION 'a signed-in user can read the allowance'; END IF;
  IF has_function_privilege('authenticated', 'public.brand_report_doc(uuid, date, date)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.brand_report_doc(uuid, date, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'the internal report document can be called from outside';
  END IF;
  IF has_function_privilege('authenticated', 'public.take_brand_pull_credits(uuid, integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'a signed-in user can spend the allowance';
  END IF;
  IF has_function_privilege('anon', 'public.get_brand_report_rows(uuid, date, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can call the signed-in report rows';
  END IF;

  -- 2. Scratch brands: A under a real admin's agency with a real portal user on it, B under a scratch agency.
  SELECT ur.user_id, ur.agency_id INTO _admin, _agency_a FROM public.user_roles ur
   WHERE ur.role = 'agency_admin' AND ur.agency_id IS NOT NULL AND NOT public.is_super_admin(ur.user_id) LIMIT 1;
  IF _admin IS NULL THEN RAISE EXCEPTION 'no agency admin to test with'; END IF;
  SELECT ur.user_id INTO _portal FROM public.user_roles ur
   WHERE ur.role = 'client_user'
     AND NOT EXISTS (SELECT 1 FROM public.user_roles o WHERE o.user_id = ur.user_id AND o.role IN ('super_admin', 'agency_admin', 'account_manager'))
   LIMIT 1;
  IF _portal IS NULL THEN RAISE EXCEPTION 'no portal user to test with'; END IF;
  INSERT INTO public.agencies (id, name, slug) VALUES (_agency_b, 'Verify brand channels', 'verify-channels-' || left(_agency_b::text, 8));
  INSERT INTO public.clients (id, name, agency_id) VALUES (_client_a, 'Verify A', _agency_a), (_client_b, 'Verify B', _agency_b);
  INSERT INTO public.client_members (client_id, user_id) VALUES (_client_a, _portal);
  INSERT INTO public.brand_channels (id, client_id, platform, handle) VALUES (_chan_a, _client_a, 'tiktok', 'verify.a'), (_chan_b, _client_b, 'tiktok', 'verify.b');
  INSERT INTO public.brand_channel_days (channel_id, day, followers, source) VALUES (_chan_b, '2026-10-01', 5, 'scrapecreators');

  -- 3. A's admin sees A and not B, can add and remove on A only, and can set nothing but the three columns.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _admin, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.brand_channels WHERE id IN (_chan_a, _chan_b);
  IF _n <> 1 THEN RAISE EXCEPTION 'agency admin sees % of the 2 scratch channels, expected 1', _n; END IF;
  SELECT count(*) INTO _n FROM public.brand_channel_days WHERE channel_id = _chan_b;
  IF _n <> 0 THEN RAISE EXCEPTION 'agency admin can read another agency''s daily lines'; END IF;
  INSERT INTO public.brand_channels (client_id, platform, handle) VALUES (_client_a, 'instagram', 'verify.ig');
  BEGIN
    INSERT INTO public.brand_channels (client_id, platform, handle) VALUES (_client_b, 'instagram', 'verify.x');
    RAISE EXCEPTION 'an agency admin added a channel to another agency''s brand';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.brand_channels (client_id, platform, handle, source) VALUES (_client_a, 'facebook', 'verify.fb', 'connected');
    RAISE EXCEPTION 'a signed-in user set source on a new channel';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.brand_channels SET status = 'ok' WHERE id = _chan_a;
    RAISE EXCEPTION 'a signed-in user changed a channel';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.brand_posts (channel_id, external_id) VALUES (_chan_a, 'x');
    RAISE EXCEPTION 'a signed-in user wrote a post';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  DELETE FROM public.brand_channels WHERE client_id = _client_a AND handle = 'verify.ig';
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n <> 1 THEN RAISE EXCEPTION 'agency admin could not remove a channel'; END IF;
  DELETE FROM public.brand_channels WHERE id = _chan_b;
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n <> 0 THEN RAISE EXCEPTION 'agency admin removed another agency''s channel'; END IF;
  RESET ROLE;

  -- 4. The portal user sees their own brand, can't change it, and can't read another brand's report.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _portal, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.brand_channels WHERE id IN (_chan_a, _chan_b);
  IF _n <> 1 THEN RAISE EXCEPTION 'portal user sees % of the 2 scratch channels, expected 1', _n; END IF;
  BEGIN
    INSERT INTO public.brand_channels (client_id, platform, handle) VALUES (_client_a, 'instagram', 'verify.portal');
    RAISE EXCEPTION 'a portal user added a handle';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  DELETE FROM public.brand_channels WHERE id = _chan_a;
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n <> 0 THEN RAISE EXCEPTION 'a portal user removed a channel'; END IF;
  _doc := public.get_brand_report_rows(_client_a, '2026-10-01', '2026-10-31');
  IF jsonb_array_length(_doc->'channels') <> 1 THEN RAISE EXCEPTION 'the portal user''s own report has % channels', jsonb_array_length(_doc->'channels'); END IF;
  BEGIN
    _doc := public.get_brand_report_rows(_client_b, '2026-10-01', '2026-10-31');
    RAISE EXCEPTION 'a portal user read another brand''s report';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    _doc := public.get_brand_report_rows(_client_a, '2026-01-01', '2027-03-01');
    RAISE EXCEPTION 'a period over a year was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  RESET ROLE;

  -- 5. The document picks the right reading and cuts periods in Nairobi time.
  INSERT INTO public.brand_posts (id, channel_id, external_id, posted_at, format) VALUES
    (_snap, _chan_a, 'snap', '2026-10-10 08:00+00', 'video'),
    (_late, _chan_a, 'late', '2026-10-11 08:00+00', 'video'),
    (_edge_in, _chan_a, 'edge-in', '2026-10-31 20:59+00', 'video'),
    (_edge_out, _chan_a, 'edge-out', '2026-10-31 21:00+00', 'video'),
    (_prev, _chan_a, 'prev', '2026-09-15 08:00+00', 'photo'),
    (_none, _chan_a, 'none', '2026-10-12 08:00+00', 'text');
  INSERT INTO public.brand_post_metrics (post_id, captured_at, views, source) VALUES
    (_snap, '2026-10-20 02:00+00', 10, 'scrapecreators'),
    (_snap, '2026-11-20 02:00+00', 99, 'scrapecreators'),
    (_late, '2026-11-20 02:00+00', 50, 'scrapecreators'),
    (_late, '2026-11-25 02:00+00', 60, 'scrapecreators'),
    (_prev, '2026-09-20 02:00+00', 7, 'scrapecreators'),
    (_prev, '2026-10-20 02:00+00', 70, 'scrapecreators');
  INSERT INTO public.brand_channel_days (channel_id, day, followers, source) VALUES
    (_chan_a, '2026-08-29', 1, 'scrapecreators'),
    (_chan_a, '2026-08-30', 2, 'scrapecreators'),
    (_chan_a, '2026-10-31', 3, 'scrapecreators');
  _doc := public.brand_report_doc(_client_a, '2026-10-01', '2026-10-31');
  IF _doc->>'previous_from' <> '2026-08-31' OR _doc->>'previous_to' <> '2026-09-30' THEN RAISE EXCEPTION 'wrong previous period: % to %', _doc->>'previous_from', _doc->>'previous_to'; END IF;
  IF _doc::text LIKE '%status_note%' OR _doc::text LIKE '%connected_by%' THEN RAISE EXCEPTION 'the document carries staff fields'; END IF;

  SELECT p INTO _row FROM jsonb_array_elements(_doc->'posts') p WHERE p->>'id' = _snap::text;
  IF (_row->'snapshot'->>'views')::int <> 10 OR (_row->'snapshot'->>'counted_late')::boolean THEN RAISE EXCEPTION 'a reading after the period beat the one inside it: %', _row; END IF;
  SELECT p INTO _row FROM jsonb_array_elements(_doc->'posts') p WHERE p->>'id' = _late::text;
  IF (_row->'snapshot'->>'views')::int <> 50 OR NOT (_row->'snapshot'->>'counted_late')::boolean THEN RAISE EXCEPTION 'a post first read after the period is wrong: %', _row; END IF;
  SELECT p INTO _row FROM jsonb_array_elements(_doc->'posts') p WHERE p->>'id' = _prev::text;
  IF _row->>'period' <> 'previous' OR (_row->'snapshot'->>'views')::int <> 7 THEN RAISE EXCEPTION 'a previous-period post took the wrong reading: %', _row; END IF;
  SELECT p INTO _row FROM jsonb_array_elements(_doc->'posts') p WHERE p->>'id' = _none::text;
  IF jsonb_typeof(_row->'snapshot') <> 'null' THEN RAISE EXCEPTION 'a post with no reading has a snapshot: %', _row; END IF;
  SELECT count(*) INTO _n FROM jsonb_array_elements(_doc->'posts') p WHERE p->>'id' = _edge_in::text;
  IF _n <> 1 THEN RAISE EXCEPTION '20:59 UTC on the last day is 23:59 in Nairobi and should be in the period'; END IF;
  SELECT count(*) INTO _n FROM jsonb_array_elements(_doc->'posts') p WHERE p->>'id' = _edge_out::text;
  IF _n <> 0 THEN RAISE EXCEPTION '21:00 UTC on the last day is midnight in Nairobi and should be out of the period'; END IF;

  SELECT count(*) INTO _n FROM jsonb_array_elements(_doc->'days') d WHERE d->>'channel_id' = _chan_a::text AND d->>'day' = '2026-08-30';
  IF _n <> 1 THEN RAISE EXCEPTION 'the last line before the previous period did not come back'; END IF;
  SELECT count(*) INTO _n FROM jsonb_array_elements(_doc->'days') d WHERE d->>'channel_id' = _chan_a::text AND d->>'day' = '2026-08-29';
  IF _n <> 0 THEN RAISE EXCEPTION 'an older line came back'; END IF;

  -- 6. A new channel starts on public numbers, a bad handle is refused, and the allowance stops at its cap.
  SELECT count(*) INTO _n FROM public.brand_channels WHERE id = _chan_a AND source = 'public' AND status = 'ok';
  IF _n <> 1 THEN RAISE EXCEPTION 'a new channel is not public and ok'; END IF;
  BEGIN
    INSERT INTO public.brand_channels (client_id, platform, handle) VALUES (_client_a, 'tiktok', '@Bad Handle');
    RAISE EXCEPTION 'a bad handle was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.brand_channels (client_id, platform, handle) VALUES (_client_a, 'youtube', 'verify.yt');
    RAISE EXCEPTION 'a platform outside this build was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  _ok := public.take_brand_pull_credits(_agency_b, 3, 5);
  IF NOT _ok THEN RAISE EXCEPTION 'the allowance refused a first take'; END IF;
  _ok := public.take_brand_pull_credits(_agency_b, 3, 5);
  IF _ok THEN RAISE EXCEPTION 'the allowance went over its cap'; END IF;

  -- 7. A stranger can do nothing.
  IF public.can_view_brand_channels(gen_random_uuid(), _client_a) OR public.can_manage_brand_channels(gen_random_uuid(), _client_a) THEN
    RAISE EXCEPTION 'a stranger passes the access rules';
  END IF;
  IF NOT public.can_view_brand_channels(_portal, _client_a) OR public.can_manage_brand_channels(_portal, _client_a) THEN
    RAISE EXCEPTION 'a portal user should view but not manage';
  END IF;
END
