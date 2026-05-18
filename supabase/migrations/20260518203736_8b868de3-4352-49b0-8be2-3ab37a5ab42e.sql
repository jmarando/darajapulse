
CREATE TABLE public.report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  contest_id uuid,
  report_type text NOT NULL CHECK (report_type IN ('campaign_weekly','contest_daily','draw_closed')),
  enabled boolean NOT NULL DEFAULT true,
  send_hour smallint NOT NULL DEFAULT 8,
  send_minute smallint NOT NULL DEFAULT 0,
  send_dow smallint,
  timezone text NOT NULL DEFAULT 'Africa/Nairobi',
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.report_schedules (campaign_id);
CREATE INDEX ON public.report_schedules (enabled, report_type);

ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency manages report_schedules" ON public.report_schedules
  FOR ALL USING (has_role(auth.uid(),'agency_admin') OR has_role(auth.uid(),'account_manager'))
  WITH CHECK (has_role(auth.uid(),'agency_admin') OR has_role(auth.uid(),'account_manager'));
CREATE POLICY "Client users read their report_schedules" ON public.report_schedules
  FOR SELECT USING (user_has_campaign_access(auth.uid(), campaign_id));
CREATE TRIGGER touch_report_schedules BEFORE UPDATE ON public.report_schedules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.report_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  email text NOT NULL,
  name text,
  audience text NOT NULL CHECK (audience IN ('agency','client','extra')),
  receives_campaign_weekly boolean NOT NULL DEFAULT true,
  receives_contest_daily boolean NOT NULL DEFAULT true,
  receives_draw_closed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, email)
);
CREATE INDEX ON public.report_recipients (campaign_id);

ALTER TABLE public.report_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency manages report_recipients" ON public.report_recipients
  FOR ALL USING (has_role(auth.uid(),'agency_admin') OR has_role(auth.uid(),'account_manager'))
  WITH CHECK (has_role(auth.uid(),'agency_admin') OR has_role(auth.uid(),'account_manager'));
CREATE POLICY "Client users read their report_recipients" ON public.report_recipients
  FOR SELECT USING (user_has_campaign_access(auth.uid(), campaign_id));
