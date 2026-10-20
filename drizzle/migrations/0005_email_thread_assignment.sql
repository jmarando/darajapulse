-- Inbox conversations can be assigned to a teammate. Status already supports
-- 'open' and 'done' (new mail reopens a done thread in resend-inbound), and the
-- existing workspace update policy covers the new column.
ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS email_threads_assigned_to_idx ON public.email_threads(assigned_to) WHERE assigned_to IS NOT NULL;
