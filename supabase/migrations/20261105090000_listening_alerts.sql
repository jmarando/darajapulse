-- Listening alert emails: who is told when a negative post about a brand is spreading, and what was already sent.
--
-- Why: the listening-alerts function emails a brand's alert list when a negative post passes the same Watch or Act
-- that the morning view on the Listening page shows. This is what sits behind it. Until it is applied that function
-- cannot run.
--
-- What:
--   * listening_alert_rules: one row per brand. Off until someone turns it on, and nobody on the list until someone
--     adds an address (at most 10). Whoever can read the brand's Listening can read it; only agency staff of the
--     brand's agency and super admins can change it, because the email goes out under Pulse's name to every address
--     on the list.
--   * listening_alert_log: one row per brand and alert key (watch:<post link>, act:<post link>, spike:<Nairobi date>),
--     so the hourly job never emails the same thing twice. Service role only.
--   * An internal_job_keys row named listening-alerts. The key is made by the table's default. The cron job below
--     presents it for you; never read it out of a query's output.
--   * Cron job listening-alerts-hourly at minute 40, after the sweep at minute 25, through invoke_job_function.
--
-- Checked with supabase/verify/listening_alerts.sql inside a rolled-back DO block.
--
-- To roll back:
--   SELECT cron.unschedule('listening-alerts-hourly');
--   DELETE FROM public.internal_job_keys WHERE name = 'listening-alerts';
--   DROP TABLE IF EXISTS public.listening_alert_log;
--   DROP TABLE IF EXISTS public.listening_alert_rules;
--   DROP FUNCTION IF EXISTS public.can_edit_listening_alerts(uuid, uuid);

CREATE TABLE IF NOT EXISTS public.listening_alert_rules (
  client_id   uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  enabled     boolean NOT NULL DEFAULT false,
  recipients  text[] NOT NULL DEFAULT '{}' CHECK (cardinality(recipients) <= 10),
  updated_by  uuid DEFAULT auth.uid(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.listening_alert_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  key         text NOT NULL CHECK (length(key) BETWEEN 1 AND 600),
  level       text NOT NULL CHECK (level IN ('watch', 'act', 'spike')),
  sent_at     timestamptz NOT NULL DEFAULT now(),
  recipients  integer NOT NULL DEFAULT 0 CHECK (recipients >= 0),
  UNIQUE (client_id, key)
);
CREATE INDEX IF NOT EXISTS listening_alert_log_sent_idx ON public.listening_alert_log (client_id, sent_at DESC);

-- Agency staff of the brand's agency, or super admins: the people who may change who is emailed. Brand portal
-- users can read the rule (can_access_listening) but not change it.
CREATE OR REPLACE FUNCTION public.can_edit_listening_alerts(_user_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_super_admin(_user_id)
      OR EXISTS (
        SELECT 1 FROM public.clients c
        JOIN public.user_roles ur
          ON ur.user_id = _user_id
         AND ur.agency_id = c.agency_id
         AND ur.role IN ('agency_admin', 'account_manager')
       WHERE c.id = _client_id
      );
$function$;
REVOKE EXECUTE ON FUNCTION public.can_edit_listening_alerts(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_listening_alerts(uuid, uuid) TO authenticated, service_role;

ALTER TABLE public.listening_alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listening_alert_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.listening_alert_rules FROM anon;
REVOKE ALL ON public.listening_alert_log FROM anon, authenticated;

DROP POLICY IF EXISTS "Listening alerts: read" ON public.listening_alert_rules;
DROP POLICY IF EXISTS "Listening alerts: add" ON public.listening_alert_rules;
DROP POLICY IF EXISTS "Listening alerts: edit" ON public.listening_alert_rules;
DROP POLICY IF EXISTS "Listening alerts: remove" ON public.listening_alert_rules;
CREATE POLICY "Listening alerts: read" ON public.listening_alert_rules FOR SELECT TO authenticated
  USING (public.can_access_listening(auth.uid(), client_id));
CREATE POLICY "Listening alerts: add" ON public.listening_alert_rules FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_listening_alerts(auth.uid(), client_id));
CREATE POLICY "Listening alerts: edit" ON public.listening_alert_rules FOR UPDATE TO authenticated
  USING (public.can_edit_listening_alerts(auth.uid(), client_id))
  WITH CHECK (public.can_edit_listening_alerts(auth.uid(), client_id));
CREATE POLICY "Listening alerts: remove" ON public.listening_alert_rules FOR DELETE TO authenticated
  USING (public.can_edit_listening_alerts(auth.uid(), client_id));

INSERT INTO public.internal_job_keys(name) VALUES ('listening-alerts') ON CONFLICT (name) DO NOTHING;

SELECT cron.schedule('listening-alerts-hourly', '40 * * * *',
  $$SELECT public.invoke_job_function('listening-alerts', '{}'::jsonb)$$);
