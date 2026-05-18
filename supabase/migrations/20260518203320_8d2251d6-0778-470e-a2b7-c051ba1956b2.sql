-- Schedule automatic polling for active contests every 3 hours.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.run_contest_auto_polling()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  c RECORD;
  base_url text := 'https://ucxlveehobmeywkiynpy.supabase.co/functions/v1';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjeGx2ZWVob2JtZXl3a2l5bnB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5ODc1ODAsImV4cCI6MjA5MzU2MzU4MH0.0n5mEQeSpwhHSwwGPAjLzkDbCAUfiahE5WTp27EmP8Y';
BEGIN
  FOR c IN
    SELECT id FROM public.contests
    WHERE is_active = true
      AND start_date <= CURRENT_DATE
      AND end_date   >= CURRENT_DATE
  LOOP
    PERFORM net.http_post(
      url := base_url || '/contestants-sync',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || anon_key),
      body := jsonb_build_object('contest_id', c.id, 'triggered_by', 'cron')
    );
    PERFORM net.http_post(
      url := base_url || '/contest-discover-posts',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || anon_key),
      body := jsonb_build_object('contest_id', c.id, 'triggered_by', 'cron')
    );
  END LOOP;
END;
$$;

-- Replace any prior schedule with the same name, then schedule fresh.
DO $$
BEGIN
  PERFORM cron.unschedule('contest-auto-poll');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'contest-auto-poll',
  '0 */3 * * *',
  $$SELECT public.run_contest_auto_polling();$$
);