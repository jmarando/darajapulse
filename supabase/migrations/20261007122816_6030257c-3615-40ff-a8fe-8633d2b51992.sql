CREATE TABLE IF NOT EXISTS public.internal_job_keys (name text PRIMARY KEY, key text NOT NULL DEFAULT encode(gen_random_bytes(24),'hex'), created_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON public.internal_job_keys FROM anon, authenticated;
GRANT ALL ON public.internal_job_keys TO service_role;
ALTER TABLE public.internal_job_keys ENABLE ROW LEVEL SECURITY;
INSERT INTO public.internal_job_keys(name) VALUES ('purge-draft-videos') ON CONFLICT DO NOTHING;