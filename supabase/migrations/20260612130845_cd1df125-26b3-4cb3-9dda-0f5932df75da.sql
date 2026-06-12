DO $$ BEGIN
  CREATE TYPE public.agency_kind AS ENUM ('agency','media_house');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS kind public.agency_kind NOT NULL DEFAULT 'agency';