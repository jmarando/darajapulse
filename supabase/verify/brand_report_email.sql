-- Checks for 20261106120000_brand_report_email.sql (the monthly email). Every scratch row rolls back with the block.
-- It never reads the job key itself, only that a row exists and how long its key is.
DECLARE
  _agency_a uuid;
  _admin uuid;
  _portal uuid;
  _client_a uuid := gen_random_uuid();
  _n int;
BEGIN
  SELECT length(key) INTO _n FROM public.internal_job_keys WHERE name = 'send-brand-report';
  IF COALESCE(_n, 0) < 32 THEN RAISE EXCEPTION 'the send-brand-report job key is missing or short'; END IF;
  SELECT count(*) INTO _n FROM cron.job WHERE jobname = 'send-brand-report-monthly' AND schedule = '0 5-10 1 * *' AND active;
  IF _n <> 1 THEN RAISE EXCEPTION 'send-brand-report-monthly is not scheduled'; END IF;
  IF has_table_privilege('anon', 'public.brand_report_settings', 'SELECT') OR has_table_privilege('anon', 'public.brand_report_sends', 'SELECT') THEN RAISE EXCEPTION 'anon can read a monthly email table'; END IF;
  IF has_table_privilege('authenticated', 'public.brand_report_sends', 'SELECT') OR has_table_privilege('authenticated', 'public.brand_report_sends', 'INSERT') THEN RAISE EXCEPTION 'a signed-in user can reach the send log'; END IF;

  SELECT ur.user_id, ur.agency_id INTO _admin, _agency_a FROM public.user_roles ur
   WHERE ur.role = 'agency_admin' AND ur.agency_id IS NOT NULL AND NOT public.is_super_admin(ur.user_id) LIMIT 1;
  SELECT ur.user_id INTO _portal FROM public.user_roles ur
   WHERE ur.role = 'client_user' AND NOT EXISTS (SELECT 1 FROM public.user_roles o WHERE o.user_id = ur.user_id AND o.role IN ('super_admin', 'agency_admin', 'account_manager')) LIMIT 1;
  INSERT INTO public.clients (id, name, agency_id) VALUES (_client_a, 'Verify A', _agency_a);
  INSERT INTO public.client_members (client_id, user_id) VALUES (_client_a, _portal);

  -- Staff set it; a new row is off with nobody on the list; more than 10 addresses is refused.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _admin, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.brand_report_settings (client_id) VALUES (_client_a);
  SELECT count(*) INTO _n FROM public.brand_report_settings WHERE client_id = _client_a AND NOT monthly_email AND cardinality(recipients) = 0;
  IF _n <> 1 THEN RAISE EXCEPTION 'a new setting is not off and empty'; END IF;
  BEGIN
    UPDATE public.brand_report_settings SET recipients = ARRAY(SELECT 'a' || g || '@example.test' FROM generate_series(1, 11) g) WHERE client_id = _client_a;
    RAISE EXCEPTION 'an 11-address list was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RESET ROLE;

  -- A brand user reads it and can't change it.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _portal, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.brand_report_settings WHERE client_id = _client_a;
  IF _n <> 1 THEN RAISE EXCEPTION 'a brand user cannot read the setting'; END IF;
  UPDATE public.brand_report_settings SET monthly_email = true WHERE client_id = _client_a;
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n <> 0 THEN RAISE EXCEPTION 'a brand user changed the setting'; END IF;
  RESET ROLE;

  -- One send per brand and month.
  INSERT INTO public.brand_report_sends (client_id, month) VALUES (_client_a, '2026-10-01');
  BEGIN
    INSERT INTO public.brand_report_sends (client_id, month) VALUES (_client_a, '2026-10-01');
    RAISE EXCEPTION 'the same month was logged twice';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END
