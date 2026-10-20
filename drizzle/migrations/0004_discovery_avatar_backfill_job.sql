-- Discovery profile photos from Instagram, Facebook and TikTok are signed CDN links
-- that expire within days. discovery-avatar-backfill copies them into our own
-- storage and, for links that already expired, looks the photo up again (capped at
-- 100 ScrapeCreators credits a run). New photos are copied when captured, so after
-- the first run this mostly finds nothing to do.
INSERT INTO public.internal_job_keys(name) VALUES ('discovery-avatar-backfill')
ON CONFLICT (name) DO NOTHING;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'discovery-avatar-backfill-daily';
SELECT cron.schedule('discovery-avatar-backfill-daily', '40 4 * * *',
  $$SELECT public.invoke_job_function('discovery-avatar-backfill', '{"refetch_expired":true,"max_credits":100}'::jsonb)$$);
