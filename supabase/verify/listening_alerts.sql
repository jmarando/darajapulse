-- Checks for 20261105090000_listening_alerts.sql (alert emails).
-- Paste inside the dry-run DO block, after EXECUTE of the migration text and before the final
-- RAISE EXCEPTION 'ROLLED_BACK: all checks passed'. Every scratch row rolls back with the block.
-- It never reads the job key itself, only that a row exists and how long its key is.
DECLARE
  _agency uuid := gen_random_uuid();
  _client uuid := gen_random_uuid();
  _n int;
  _ok boolean;
BEGIN
  -- 0. The job key row is there and the key is a real one; the hourly job is scheduled after the sweep.
  SELECT count(*) INTO _n FROM public.internal_job_keys WHERE name = 'listening-alerts';
  IF _n <> 1 THEN RAISE EXCEPTION 'the listening-alerts job key row is missing (% rows)', _n; END IF;
  SELECT length(key) INTO _n FROM public.internal_job_keys WHERE name = 'listening-alerts';
  IF _n < 32 THEN RAISE EXCEPTION 'the listening-alerts job key is only % characters', _n; END IF;
  SELECT count(*) INTO _n FROM cron.job WHERE jobname = 'listening-alerts-hourly' AND schedule = '40 * * * *' AND active;
  IF _n <> 1 THEN RAISE EXCEPTION 'listening-alerts-hourly is not scheduled at minute 40 (% jobs)', _n; END IF;

  -- 1. Row security is on for both tables, anon reaches neither, and only the service role reaches the log.
  SELECT count(*) INTO _n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
   WHERE s.nspname = 'public' AND c.relname IN ('listening_alert_rules', 'listening_alert_log') AND c.relrowsecurity;
  IF _n <> 2 THEN RAISE EXCEPTION 'row security is on for % of the 2 alert tables', _n; END IF;
  IF has_table_privilege('anon', 'public.listening_alert_rules', 'SELECT')
     OR has_table_privilege('anon', 'public.listening_alert_log', 'SELECT') THEN
    RAISE EXCEPTION 'anon can read an alert table';
  END IF;
  IF has_table_privilege('authenticated', 'public.listening_alert_log', 'SELECT')
     OR has_table_privilege('authenticated', 'public.listening_alert_log', 'INSERT') THEN
    RAISE EXCEPTION 'a signed-in user can reach the alert log';
  END IF;

  -- 2. A new rule is off with nobody on the list; more than 10 addresses and a repeated key are refused.
  INSERT INTO public.agencies (id, name, slug) VALUES (_agency, 'Verify listening alerts', 'verify-alerts-' || left(_agency::text, 8));
  INSERT INTO public.clients (id, name, agency_id) VALUES (_client, 'Verify client', _agency);
  INSERT INTO public.listening_alert_rules (client_id) VALUES (_client);
  SELECT count(*) INTO _n FROM public.listening_alert_rules
   WHERE client_id = _client AND NOT enabled AND cardinality(recipients) = 0;
  IF _n <> 1 THEN RAISE EXCEPTION 'a new rule is not off and empty'; END IF;
  BEGIN
    UPDATE public.listening_alert_rules
       SET recipients = ARRAY(SELECT 'a' || g || '@example.test' FROM generate_series(1, 11) g)
     WHERE client_id = _client;
    RAISE EXCEPTION 'an 11-address list was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO public.listening_alert_log (client_id, key, level) VALUES (_client, 'watch:https://example.test/a', 'watch');
  BEGIN
    INSERT INTO public.listening_alert_log (client_id, key, level) VALUES (_client, 'watch:https://example.test/a', 'watch');
    RAISE EXCEPTION 'the same alert key was logged twice';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- 3. A stranger may neither read the brand nor change its alert list.
  SELECT public.can_edit_listening_alerts(gen_random_uuid(), _client) INTO _ok;
  IF _ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'a stranger can edit the alert list'; END IF;
  SELECT public.can_access_listening(gen_random_uuid(), _client) INTO _ok;
  IF _ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'a stranger can read the brand'; END IF;
END
