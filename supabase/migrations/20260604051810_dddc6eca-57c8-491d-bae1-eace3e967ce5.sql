CREATE TABLE public.contest_excluded_handles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL,
  handle text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contest_id, handle)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contest_excluded_handles TO authenticated;
GRANT SELECT ON public.contest_excluded_handles TO anon;
GRANT ALL ON public.contest_excluded_handles TO service_role;
ALTER TABLE public.contest_excluded_handles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency manages contest_excluded_handles" ON public.contest_excluded_handles
  FOR ALL USING (has_role(auth.uid(), 'agency_admin'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'agency_admin'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role));
CREATE POLICY "Public reads contest_excluded_handles for active contests" ON public.contest_excluded_handles
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.contests c WHERE c.id = contest_excluded_handles.contest_id AND c.is_active = true));
CREATE INDEX idx_contest_excluded_handles_contest ON public.contest_excluded_handles(contest_id);