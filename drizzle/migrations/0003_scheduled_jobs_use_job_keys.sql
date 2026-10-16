-- Scheduled jobs authenticate to edge functions with a per-function key from
-- internal_job_keys (sent as x-job-key) instead of relying on the public anon
-- key, which every visitor has. The anon key is still sent so functions that keep
-- verify_jwt on get past the gateway; the functions themselves check x-job-key.
-- Safe to apply before the matching function changes deploy: functions that don't
-- check x-job-key yet simply ignore it.
INSERT INTO public.internal_job_keys(name) VALUES
  ('tiktok-poll'),
  ('fetch-public-metrics'),
  ('contestants-sync'),
  ('contest-discover-posts'),
  ('run-report-schedules'),
  ('contest-fetch-handle-posts'),
  ('refresh-influencer-stats'),
  ('contest-refresh-metrics'),
  ('stories-sync')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.invoke_job_function(_fn text, _body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  anon_key constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjeGx2ZWVob2JtZXl3a2l5bnB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5ODc1ODAsImV4cCI6MjA5MzU2MzU4MH0.0n5mEQeSpwhHSwwGPAjLzkDbCAUfiahE5WTp27EmP8Y';
  job_key text;
BEGIN
  SELECT key INTO job_key FROM public.internal_job_keys WHERE name = _fn;
  IF job_key IS NULL THEN RAISE EXCEPTION 'no job key registered for %', _fn; END IF;
  RETURN net.http_post(
    url := 'https://ucxlveehobmeywkiynpy.supabase.co/functions/v1/' || _fn,
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', anon_key, 'Authorization', 'Bearer ' || anon_key, 'x-job-key', job_key),
    body := _body
  );
END $$;
REVOKE ALL ON FUNCTION public.invoke_job_function(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_job_function(text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.run_contest_auto_polling()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT id FROM public.contests
    WHERE is_active = true
      AND start_date <= CURRENT_DATE
      AND end_date   >= CURRENT_DATE
  LOOP
    PERFORM public.invoke_job_function('contestants-sync', jsonb_build_object('contest_id', c.id, 'triggered_by', 'cron'));
    PERFORM public.invoke_job_function('contest-discover-posts', jsonb_build_object('contest_id', c.id, 'triggered_by', 'cron'));
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.run_contest_auto_polling() FROM PUBLIC, anon, authenticated;

-- Granted to service_role only, but functions are executable by PUBLIC unless
-- revoked, so any visitor could re-run suspensions or lift a manual one.
REVOKE ALL ON FUNCTION public.enforce_billing_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_billing_status() TO service_role;

-- Re-register the jobs (same names, schedules and bodies) through the helper.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN (
  'tiktok-poll-hourly', 'fetch-public-metrics-hourly', 'contestants-sync-6h', 'contest-discover-posts-6h',
  'report-schedules-runner', 'contest-handle-fetch-hourly', 'refresh-influencer-stats-daily',
  'contest-refresh-metrics-2h', 'contest-refresh-metrics-retry-invalid-12h', 'stories-sync-4h'
);
SELECT cron.schedule('tiktok-poll-hourly', '15 3,15 * * *',
  $$SELECT public.invoke_job_function('tiktok-poll')$$);
SELECT cron.schedule('fetch-public-metrics-hourly', '0 3,15 * * *',
  $$SELECT public.invoke_job_function('fetch-public-metrics', '{"stale":true,"max":60}'::jsonb)$$);
SELECT cron.schedule('contestants-sync-6h', '30 3 * * *',
  $$SELECT public.invoke_job_function('contestants-sync', jsonb_build_object('contest_id', c.id, 'triggered_by', 'cron')) FROM public.contests c WHERE c.is_active$$);
SELECT cron.schedule('contest-discover-posts-6h', '15 3,15 * * *',
  $$SELECT public.invoke_job_function('contest-discover-posts', jsonb_build_object('contest_id', c.id, 'triggered_by', 'cron')) FROM public.contests c WHERE c.is_active$$);
SELECT cron.schedule('report-schedules-runner', '*/15 * * * *',
  $$SELECT public.invoke_job_function('run-report-schedules', '{"triggered_by":"cron"}'::jsonb)$$);
SELECT cron.schedule('contest-handle-fetch-hourly', '7 3,15 * * *',
  $$SELECT public.invoke_job_function('contest-fetch-handle-posts', jsonb_build_object('contest_id', c.id, 'triggered_by', 'cron')) FROM public.contests c WHERE c.is_active = true AND c.start_date <= CURRENT_DATE AND c.end_date >= CURRENT_DATE$$);
SELECT cron.schedule('refresh-influencer-stats-daily', '15 2 * * *',
  $$SELECT public.invoke_job_function('refresh-influencer-stats', '{"limit":150,"stale_hours":20}'::jsonb)$$);
SELECT cron.schedule('contest-refresh-metrics-2h', '45 3,15 * * *',
  $$SELECT public.invoke_job_function('contest-refresh-metrics', jsonb_build_object('contest_id', c.id, 'only_empty', false)) FROM public.contests c WHERE c.is_active = true AND c.start_date <= CURRENT_DATE AND c.end_date >= CURRENT_DATE$$);
SELECT cron.schedule('contest-refresh-metrics-retry-invalid-12h', '15 5 * * *',
  $$SELECT public.invoke_job_function('contest-refresh-metrics', jsonb_build_object('contest_id', c.id, 'retry_invalid', true, 'only_empty', true)) FROM public.contests c WHERE c.is_active = true AND c.start_date <= CURRENT_DATE AND c.end_date >= CURRENT_DATE$$);
SELECT cron.schedule('stories-sync-4h', '20 */4 * * *',
  $$SELECT public.invoke_job_function('stories-sync', jsonb_build_object('time', now()))$$);
