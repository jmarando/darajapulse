ALTER TABLE public.discovery_creators
  ADD COLUMN IF NOT EXISTS profile_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS status_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_note text,
  ADD COLUMN IF NOT EXISTS person_key text;

ALTER TABLE public.discovery_creators
  DROP CONSTRAINT IF EXISTS discovery_creators_profile_status_check;
ALTER TABLE public.discovery_creators
  ADD CONSTRAINT discovery_creators_profile_status_check CHECK (profile_status IN (
    'active','verified_active','unverified','not_found','deleted','suspended',
    'private','username_changed','temporarily_unavailable','check_failed','archived'
  ));

CREATE INDEX IF NOT EXISTS discovery_creators_profile_status_idx ON public.discovery_creators (profile_status);
CREATE INDEX IF NOT EXISTS discovery_creators_person_key_idx ON public.discovery_creators (person_key);