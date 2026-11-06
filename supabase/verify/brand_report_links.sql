-- Checks for 20261106110000_brand_report_links.sql (share links). Every scratch row rolls back with the block.
DECLARE
  _agency_a uuid;
  _admin uuid;
  _agency_b uuid := gen_random_uuid();
  _client_a uuid := gen_random_uuid();
  _client_b uuid := gen_random_uuid();
  _chan_a uuid := gen_random_uuid();
  _chan_b uuid := gen_random_uuid();
  _token_a text;
  _token_b text;
  _doc jsonb;
  _n int;
  _started timestamptz;
  _ms numeric;
  _chan uuid;
BEGIN
  IF has_table_privilege('anon', 'public.brand_report_links', 'SELECT') THEN RAISE EXCEPTION 'anon can read share links'; END IF;

  SELECT ur.user_id, ur.agency_id INTO _admin, _agency_a FROM public.user_roles ur
   WHERE ur.role = 'agency_admin' AND ur.agency_id IS NOT NULL AND NOT public.is_super_admin(ur.user_id) LIMIT 1;
  INSERT INTO public.agencies (id, name, slug) VALUES (_agency_b, 'Verify share', 'verify-share-' || left(_agency_b::text, 8));
  INSERT INTO public.clients (id, name, agency_id) VALUES (_client_a, 'Verify A', _agency_a), (_client_b, 'Verify B', _agency_b);
  INSERT INTO public.brand_channels (id, client_id, platform, handle) VALUES (_chan_a, _client_a, 'tiktok', 'verify.a'), (_chan_b, _client_b, 'tiktok', 'verify.b');
  INSERT INTO public.brand_report_links (client_id) VALUES (_client_b) RETURNING token INTO _token_b;

  -- Staff make a link for their own brand only, and only one can be live.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _admin, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.brand_report_links (client_id) VALUES (_client_a) RETURNING token INTO _token_a;
  BEGIN
    INSERT INTO public.brand_report_links (client_id) VALUES (_client_b);
    RAISE EXCEPTION 'an agency admin made a link for another agency''s brand';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.brand_report_links (client_id) VALUES (_client_a);
    RAISE EXCEPTION 'a brand got two live links';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  RESET ROLE;

  -- A visitor gets the link's own brand and nothing else.
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  _doc := public.get_brand_report_rows_by_token(_token_a, '2026-10-01', '2026-10-31');
  IF _doc->'client'->>'name' <> 'Verify A' THEN RAISE EXCEPTION 'a share link returned the wrong brand: %', _doc->'client'; END IF;
  IF jsonb_array_length(_doc->'channels') <> 1 OR _doc->'channels'->0->>'id' <> _chan_a::text THEN RAISE EXCEPTION 'a share link returned other channels'; END IF;
  IF _doc::text LIKE '%status_note%' OR _doc::text LIKE '%connected_by%' THEN RAISE EXCEPTION 'a share link carries staff fields'; END IF;
  IF public.get_brand_report_rows_by_token('made-up', '2026-10-01', '2026-10-31') IS NOT NULL THEN RAISE EXCEPTION 'a made-up link got an answer'; END IF;
  BEGIN
    PERFORM public.brand_report_doc(_client_b, '2026-10-01', '2026-10-31');
    RAISE EXCEPTION 'a visitor called the internal document directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    SELECT count(*) INTO _n FROM public.brand_channels;
    RAISE EXCEPTION 'a visitor read the channels table';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- A link turned off gives nothing.
  UPDATE public.brand_report_links SET is_active = false WHERE token = _token_b;
  IF public.get_brand_report_rows_by_token(_token_b, '2026-10-01', '2026-10-31') IS NOT NULL THEN RAISE EXCEPTION 'a turned-off link still answers'; END IF;

  -- On realistic volumes the visitor's call stays well inside the 3 second limit: 9 channels, 300 posts each, 60 readings each.
  FOR _n IN 1..8 LOOP
    INSERT INTO public.brand_channels (client_id, platform, handle) VALUES (_client_a, 'tiktok', 'load.' || _n);
  END LOOP;
  INSERT INTO public.brand_posts (channel_id, external_id, posted_at, format)
  SELECT c.id, 'p' || g, '2026-10-31 12:00+00'::timestamptz - (g || ' hours')::interval, 'video'
    FROM public.brand_channels c CROSS JOIN generate_series(1, 300) g WHERE c.client_id = _client_a;
  INSERT INTO public.brand_post_metrics (post_id, captured_at, views, likes, source)
  SELECT p.id, p.posted_at + (d || ' days')::interval, d * 10, d, 'scrapecreators'
    FROM public.brand_posts p JOIN public.brand_channels c ON c.id = p.channel_id CROSS JOIN generate_series(1, 60) d WHERE c.client_id = _client_a;
  ANALYZE public.brand_posts;
  ANALYZE public.brand_post_metrics;
  SET LOCAL ROLE anon;
  _started := clock_timestamp();
  _doc := public.get_brand_report_rows_by_token(_token_a, '2026-10-01', '2026-10-31');
  _ms := extract(epoch FROM clock_timestamp() - _started) * 1000;
  RESET ROLE;
  IF jsonb_array_length(_doc->'posts') < 1000 THEN RAISE EXCEPTION 'the load test read only % posts', jsonb_array_length(_doc->'posts'); END IF;
  IF _ms > 1000 THEN RAISE EXCEPTION 'the visitor''s call took % ms on % posts', round(_ms), jsonb_array_length(_doc->'posts'); END IF;
  RAISE NOTICE 'visitor call: % ms on % posts', round(_ms), jsonb_array_length(_doc->'posts');
END
