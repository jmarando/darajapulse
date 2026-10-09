CREATE OR REPLACE FUNCTION public.run_amendment_pdf_jobs() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.contract_amendment_signatures WHERE emailed_at IS NULL) THEN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='royco-amendment-pdf-retries'; RETURN; END IF;
 SELECT key INTO k FROM public.internal_job_keys WHERE name='royco-amendment';
 IF k IS NOT NULL THEN PERFORM net.http_post(url:='https://ucxlveehobmeywkiynpy.supabase.co/functions/v1/royco-amendment',headers:=jsonb_build_object('Content-Type','application/json','x-job-key',k),body:='{"action":"process"}'::jsonb); END IF;
END $$;
REVOKE ALL ON FUNCTION public.run_amendment_pdf_jobs() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run_amendment_pdf_jobs() TO service_role;
CREATE OR REPLACE FUNCTION public.wake_amendment_pdf_jobs() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM cron.schedule('royco-amendment-pdf-retries','15 * * * *','SELECT public.run_amendment_pdf_jobs()');
 PERFORM public.run_amendment_pdf_jobs();
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.drain_amendment_pdf_retries() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.contract_amendment_signatures WHERE emailed_at IS NULL) THEN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='royco-amendment-pdf-retries'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.drain_amendment_pdf_retries() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.drain_amendment_pdf_retries() TO service_role;