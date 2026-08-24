
ALTER TABLE public.email_threads REPLICA IDENTITY FULL;
ALTER TABLE public.email_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_messages;

INSERT INTO public.email_mailboxes (address, label, agency_id) VALUES
  ('hello@reply.darajapulse.com', 'General replies', '4dc78aaa-e8ec-40f1-911e-72e307028b4e'),
  ('royco@reply.darajapulse.com', 'Royco campaigns', '4dc78aaa-e8ec-40f1-911e-72e307028b4e'),
  ('pesalink@reply.darajapulse.com', 'Pesalink campaigns', '4b9e8a05-a940-46c3-b4f1-b2f057751c2f')
ON CONFLICT (address) DO NOTHING;
