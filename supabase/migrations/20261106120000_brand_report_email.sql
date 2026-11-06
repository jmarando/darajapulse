-- The monthly organic email: who gets it for each brand, and what was already sent.
--
-- What:
--   * brand_report_settings: one row per brand. Off until someone turns it on, and nobody on the list until someone adds an
--     address (at most 10). Whoever can see the brand can read it; only agency staff can change it, because the email goes
--     out under Pulse's name to every address on the list.
--   * brand_report_sends: one row per brand and month, so a brand gets the month's email once. Service role only.
--   * An internal_job_keys row named send-brand-report. The key is made by the table's default. The cron job below presents
--     it for you; never read it out of a query's output.
--   * Cron job send-brand-report-monthly, hourly from 05:00 to 10:00 UTC on the 1st: first at 08:00 in Nairobi, then again
--     so a failed send isn't lost for a month.
--
-- Checked with supabase/verify/brand_report_email.sql inside a rolled-back DO block.
--
-- To roll back:
--   SELECT cron.unschedule('send-brand-report-monthly');
--   DELETE FROM public.internal_job_keys WHERE name = 'send-brand-report';
--   DROP TABLE IF EXISTS public.brand_report_sends;
--   DROP TABLE IF EXISTS public.brand_report_settings;

CREATE TABLE IF NOT EXISTS public.brand_report_settings (
  client_id      uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  monthly_email  boolean NOT NULL DEFAULT false,
  recipients     text[] NOT NULL DEFAULT '{}' CHECK (cardinality(recipients) <= 10),
  updated_by     uuid DEFAULT auth.uid(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brand_report_sends (
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  month       date NOT NULL,
  recipients  integer NOT NULL DEFAULT 0 CHECK (recipients >= 0),
  sent_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, month)
);

ALTER TABLE public.brand_report_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_report_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brand_report_settings FROM anon, authenticated;
REVOKE ALL ON public.brand_report_sends FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.brand_report_settings TO authenticated;

DROP POLICY IF EXISTS "Brand report settings: read" ON public.brand_report_settings;
DROP POLICY IF EXISTS "Brand report settings: add" ON public.brand_report_settings;
DROP POLICY IF EXISTS "Brand report settings: edit" ON public.brand_report_settings;
CREATE POLICY "Brand report settings: read" ON public.brand_report_settings FOR SELECT TO authenticated
  USING (public.can_view_brand_channels(auth.uid(), client_id));
CREATE POLICY "Brand report settings: add" ON public.brand_report_settings FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_brand_channels(auth.uid(), client_id));
CREATE POLICY "Brand report settings: edit" ON public.brand_report_settings FOR UPDATE TO authenticated
  USING (public.can_manage_brand_channels(auth.uid(), client_id))
  WITH CHECK (public.can_manage_brand_channels(auth.uid(), client_id));

INSERT INTO public.internal_job_keys(name) VALUES ('send-brand-report') ON CONFLICT (name) DO NOTHING;

SELECT cron.schedule('send-brand-report-monthly', '0 5-10 1 * *',
  $$SELECT public.invoke_job_function('send-brand-report', '{}'::jsonb)$$);
