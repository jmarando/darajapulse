ALTER TABLE public.contests
  ADD CONSTRAINT contests_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;