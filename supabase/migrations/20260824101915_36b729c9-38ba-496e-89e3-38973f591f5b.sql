
CREATE TABLE public.email_mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL UNIQUE,
  label text,
  agency_id uuid REFERENCES public.agencies(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_mailboxes TO authenticated;
GRANT ALL ON public.email_mailboxes TO service_role;
ALTER TABLE public.email_mailboxes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mailboxes readable by workspace" ON public.email_mailboxes FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (agency_id IS NOT NULL AND public.user_has_agency_access(auth.uid(), agency_id)));
CREATE POLICY "mailboxes managed by super admin" ON public.email_mailboxes FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TABLE public.email_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid REFERENCES public.agencies(id) ON DELETE CASCADE,
  mailbox text NOT NULL,
  participant_email text NOT NULL,
  participant_name text,
  subject text,
  influencer_id uuid REFERENCES public.influencers(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_snippet text,
  unread_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mailbox, participant_email)
);
CREATE INDEX idx_email_threads_agency_last ON public.email_threads(agency_id, last_message_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_threads TO authenticated;
GRANT ALL ON public.email_threads TO service_role;
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "threads readable by workspace" ON public.email_threads FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (agency_id IS NOT NULL AND public.user_has_agency_access(auth.uid(), agency_id)));
CREATE POLICY "threads updatable by workspace" ON public.email_threads FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (agency_id IS NOT NULL AND public.user_has_agency_access(auth.uid(), agency_id)))
  WITH CHECK (public.is_super_admin(auth.uid()) OR (agency_id IS NOT NULL AND public.user_has_agency_access(auth.uid(), agency_id)));

CREATE TABLE public.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  from_email text NOT NULL,
  from_name text,
  to_emails text[] NOT NULL DEFAULT '{}',
  cc_emails text[] NOT NULL DEFAULT '{}',
  subject text,
  text_body text,
  html_body text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider_id text,
  message_id text,
  in_reply_to text,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_email_messages_provider ON public.email_messages(provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX idx_email_messages_thread ON public.email_messages(thread_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_messages TO authenticated;
GRANT ALL ON public.email_messages TO service_role;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages readable by workspace" ON public.email_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.email_threads t WHERE t.id = thread_id
      AND (public.is_super_admin(auth.uid()) OR (t.agency_id IS NOT NULL AND public.user_has_agency_access(auth.uid(), t.agency_id)))
  ));
