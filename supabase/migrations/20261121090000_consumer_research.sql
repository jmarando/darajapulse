-- Consumer research: synthetic consumer panels that react to product concepts, prices, ads and
-- videos, scored with semantic similarity rating (see supabase/functions/_shared/research-ssr.ts).
--
-- Why: agency staff test concepts before a pitch, campaigns test creative, and brands signed
-- directly run their own studies from the portal. Each study spends AI calls, so each brand has
-- a monthly allowance of units that only super admins change.
--
-- What:
--   * research_studies / research_stimuli / research_questions: what a study asks, about what,
--     of whom (panel spec). Anyone who can read the brand's Listening (agency staff of the
--     brand's agency, super admins, the brand's portal users) can draft and edit a study while
--     it is a draft. Only research-run (service role) starts, finishes, charges or refunds it.
--   * research_respondents / research_responses: the panel drawn for a study and each
--     respondent's written answers with their scored distributions. Read-only for users.
--   * research_allowances: a brand's monthly units, set by super admins (300 when unset), and
--     research_usage: units used per brand and Nairobi month. take_research_units and
--     give_back_research_units change usage atomically, for the service role only.
--   * research-media: a private bucket, files under <client_id>/<study_id>/.
--   * An internal_job_keys row named research-run and a cron job every minute that works
--     through running studies through invoke_job_function.
--
-- To roll back:
--   SELECT cron.unschedule('research-run-minutely');
--   DELETE FROM public.internal_job_keys WHERE name = 'research-run';
--   DROP POLICY IF EXISTS "Research media: read" ON storage.objects;
--   DROP POLICY IF EXISTS "Research media: upload" ON storage.objects;
--   DROP POLICY IF EXISTS "Research media: remove" ON storage.objects;
--   DROP TABLE IF EXISTS public.research_responses, public.research_respondents, public.research_questions,
--     public.research_stimuli, public.research_studies, public.research_usage, public.research_allowances;
--   DROP FUNCTION IF EXISTS public.can_access_research(uuid, uuid), public.research_media_client(text),
--     public.take_research_units(uuid, integer), public.give_back_research_units(uuid, text, integer),
--     public.research_allowance(uuid), public.research_study_editable(uuid, uuid), public.research_study_readable(uuid, uuid),
--     public.research_monthly_units(uuid);

-- ---------------------------------------------------------------- who may see a brand's research

CREATE OR REPLACE FUNCTION public.can_access_research(_user_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- The same people as the brand's Listening: its agency's staff, super admins, its portal users.
  SELECT public.can_access_listening(_user_id, _client_id);
$function$;
REVOKE EXECUTE ON FUNCTION public.can_access_research(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_research(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------- studies

CREATE TABLE IF NOT EXISTS public.research_studies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title           text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  template        text NOT NULL DEFAULT 'concept' CHECK (template IN ('concept', 'ad', 'price', 'custom')),
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'done', 'failed', 'cancelled')),
  panel           jsonb NOT NULL DEFAULT '{}'::jsonb,
  video_mode      text NOT NULL DEFAULT 'summary' CHECK (video_mode IN ('summary', 'full')),
  units_charged   integer NOT NULL DEFAULT 0 CHECK (units_charged >= 0),
  units_refunded  integer NOT NULL DEFAULT 0 CHECK (units_refunded >= 0),
  charged_month   text,
  summary         jsonb,
  error           text,
  created_by      uuid DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  finished_at     timestamptz
);
CREATE INDEX IF NOT EXISTS research_studies_client_idx ON public.research_studies (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS research_studies_running_idx ON public.research_studies (status) WHERE status = 'running';

CREATE TABLE IF NOT EXISTS public.research_stimuli (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id        uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE CASCADE,
  position        integer NOT NULL DEFAULT 0,
  label           text NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
  kind            text NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'image', 'video')),
  body            text CHECK (body IS NULL OR length(body) <= 4000),
  price           text CHECK (price IS NULL OR length(price) <= 60),
  media_path      text,
  frame_paths     text[] NOT NULL DEFAULT '{}' CHECK (cardinality(frame_paths) <= 8),
  account         text,
  account_source  text CHECK (account_source IS NULL OR account_source IN ('video', 'frames')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS research_stimuli_study_idx ON public.research_stimuli (study_id, position);

CREATE TABLE IF NOT EXISTS public.research_questions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id            uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE CASCADE,
  position            integer NOT NULL DEFAULT 0,
  key                 text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label               text NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  kind                text NOT NULL DEFAULT 'likert' CHECK (kind IN ('likert', 'open')),
  prompt              text NOT NULL CHECK (length(prompt) BETWEEN 3 AND 400),
  anchors             jsonb NOT NULL DEFAULT '[]'::jsonb,
  source              text NOT NULL DEFAULT 'template' CHECK (source IN ('template', 'custom')),
  anchors_approved_at timestamptz,
  anchor_embeddings   jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (study_id, key)
);

CREATE TABLE IF NOT EXISTS public.research_respondents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id    uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE CASCADE,
  idx         integer NOT NULL,
  profile     jsonb NOT NULL,
  UNIQUE (study_id, idx)
);

CREATE TABLE IF NOT EXISTS public.research_responses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id       uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE CASCADE,
  respondent_id  uuid NOT NULL REFERENCES public.research_respondents(id) ON DELETE CASCADE,
  stimulus_id    uuid NOT NULL REFERENCES public.research_stimuli(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  attempts       integer NOT NULL DEFAULT 0,
  answers        jsonb,
  error          text,
  claimed_until  timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (respondent_id, stimulus_id)
);
CREATE INDEX IF NOT EXISTS research_responses_pending_idx ON public.research_responses (study_id, status);

-- ---------------------------------------------------------------- allowance

CREATE TABLE IF NOT EXISTS public.research_allowances (
  client_id      uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  monthly_units  integer NOT NULL CHECK (monthly_units BETWEEN 0 AND 1000000),
  updated_by     uuid DEFAULT auth.uid(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.research_usage (
  client_id  uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  month      text NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  used       integer NOT NULL DEFAULT 0 CHECK (used >= 0),
  PRIMARY KEY (client_id, month)
);

-- 300 units a month unless a super admin set otherwise; keep in step with DEFAULT_MONTHLY_UNITS in _shared/research-run.ts.
CREATE OR REPLACE FUNCTION public.research_monthly_units(_client_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT monthly_units FROM public.research_allowances WHERE client_id = _client_id), 300);
$function$;
REVOKE EXECUTE ON FUNCTION public.research_monthly_units(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.research_monthly_units(uuid) TO service_role;

-- Take _units from the brand's allowance for this Nairobi month: the month when taken, null when it would pass it.
CREATE OR REPLACE FUNCTION public.take_research_units(_client_id uuid, _units integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _month text := to_char(now() AT TIME ZONE 'Africa/Nairobi', 'YYYY-MM');
  _cap integer := public.research_monthly_units(_client_id);
  _ok boolean;
BEGIN
  IF _units < 0 THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.research_usage (client_id, month) VALUES (_client_id, _month)
  ON CONFLICT (client_id, month) DO NOTHING;
  UPDATE public.research_usage
     SET used = used + _units
   WHERE client_id = _client_id AND month = _month AND used + _units <= _cap
  RETURNING true INTO _ok;
  RETURN CASE WHEN _ok THEN _month END;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.take_research_units(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.take_research_units(uuid, integer) TO service_role;

-- Hand back units for work that was never done (a cancelled or failed study), to the month they came from.
CREATE OR REPLACE FUNCTION public.give_back_research_units(_client_id uuid, _month text, _units integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.research_usage SET used = GREATEST(0, used - GREATEST(0, _units))
   WHERE client_id = _client_id AND month = _month;
$function$;
REVOKE EXECUTE ON FUNCTION public.give_back_research_units(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.give_back_research_units(uuid, text, integer) TO service_role;

-- This month's allowance and use, for the page.
CREATE OR REPLACE FUNCTION public.research_allowance(_client_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.can_access_research(auth.uid(), _client_id) THEN
    jsonb_build_object(
      'month', to_char(now() AT TIME ZONE 'Africa/Nairobi', 'YYYY-MM'),
      'monthly_units', public.research_monthly_units(_client_id),
      'used', COALESCE((SELECT used FROM public.research_usage
                         WHERE client_id = _client_id
                           AND month = to_char(now() AT TIME ZONE 'Africa/Nairobi', 'YYYY-MM')), 0)
    )
  END;
$function$;
REVOKE EXECUTE ON FUNCTION public.research_allowance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.research_allowance(uuid) TO authenticated, service_role;

-- A draft study of a brand the user can reach: what a stimulus or question may be added to or changed in.
CREATE OR REPLACE FUNCTION public.research_study_editable(_user_id uuid, _study_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.research_studies s
     WHERE s.id = _study_id AND s.status = 'draft'
       AND public.can_access_research(_user_id, s.client_id)
  );
$function$;
REVOKE EXECUTE ON FUNCTION public.research_study_editable(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.research_study_editable(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.research_study_readable(_user_id uuid, _study_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.research_studies s
     WHERE s.id = _study_id AND public.can_access_research(_user_id, s.client_id)
  );
$function$;
REVOKE EXECUTE ON FUNCTION public.research_study_readable(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.research_study_readable(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------- row security and column rights

ALTER TABLE public.research_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_stimuli ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_respondents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_allowances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_usage ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.research_studies, public.research_stimuli, public.research_questions, public.research_respondents,
  public.research_responses, public.research_allowances, public.research_usage FROM anon, authenticated;
GRANT ALL ON public.research_studies, public.research_stimuli, public.research_questions, public.research_respondents,
  public.research_responses, public.research_allowances, public.research_usage TO service_role;

-- Users write only what a draft is made of; status, charges, summaries, accounts and embeddings are the job's.
GRANT SELECT, DELETE ON public.research_studies TO authenticated;
GRANT INSERT (client_id, title, template, panel, video_mode) ON public.research_studies TO authenticated;
GRANT UPDATE (title, template, panel, video_mode, updated_at) ON public.research_studies TO authenticated;
GRANT SELECT, DELETE ON public.research_stimuli TO authenticated;
GRANT INSERT (study_id, position, label, kind, body, price, media_path, frame_paths) ON public.research_stimuli TO authenticated;
GRANT UPDATE (position, label, kind, body, price, media_path, frame_paths) ON public.research_stimuli TO authenticated;
GRANT SELECT (id, study_id, position, key, label, kind, prompt, anchors, source, anchors_approved_at, created_at),
  DELETE ON public.research_questions TO authenticated;
GRANT INSERT (study_id, position, key, label, kind, prompt, anchors, source, anchors_approved_at) ON public.research_questions TO authenticated;
GRANT UPDATE (position, label, prompt, anchors, anchors_approved_at) ON public.research_questions TO authenticated;
GRANT SELECT ON public.research_respondents, public.research_responses TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.research_allowances TO authenticated;

DROP POLICY IF EXISTS "Research studies: read" ON public.research_studies;
DROP POLICY IF EXISTS "Research studies: add" ON public.research_studies;
DROP POLICY IF EXISTS "Research studies: edit draft" ON public.research_studies;
DROP POLICY IF EXISTS "Research studies: remove" ON public.research_studies;
CREATE POLICY "Research studies: read" ON public.research_studies FOR SELECT TO authenticated
  USING (public.can_access_research(auth.uid(), client_id));
CREATE POLICY "Research studies: add" ON public.research_studies FOR INSERT TO authenticated
  WITH CHECK (public.can_access_research(auth.uid(), client_id) AND status = 'draft');
CREATE POLICY "Research studies: edit draft" ON public.research_studies FOR UPDATE TO authenticated
  USING (public.can_access_research(auth.uid(), client_id) AND status = 'draft')
  WITH CHECK (public.can_access_research(auth.uid(), client_id) AND status = 'draft');
-- A running study is cancelled first, so its unspent units go back before it can be removed.
CREATE POLICY "Research studies: remove" ON public.research_studies FOR DELETE TO authenticated
  USING (public.can_access_research(auth.uid(), client_id) AND status <> 'running');

DROP POLICY IF EXISTS "Research stimuli: read" ON public.research_stimuli;
DROP POLICY IF EXISTS "Research stimuli: add" ON public.research_stimuli;
DROP POLICY IF EXISTS "Research stimuli: edit" ON public.research_stimuli;
DROP POLICY IF EXISTS "Research stimuli: remove" ON public.research_stimuli;
CREATE POLICY "Research stimuli: read" ON public.research_stimuli FOR SELECT TO authenticated
  USING (public.research_study_readable(auth.uid(), study_id));
CREATE POLICY "Research stimuli: add" ON public.research_stimuli FOR INSERT TO authenticated
  WITH CHECK (public.research_study_editable(auth.uid(), study_id));
CREATE POLICY "Research stimuli: edit" ON public.research_stimuli FOR UPDATE TO authenticated
  USING (public.research_study_editable(auth.uid(), study_id))
  WITH CHECK (public.research_study_editable(auth.uid(), study_id));
CREATE POLICY "Research stimuli: remove" ON public.research_stimuli FOR DELETE TO authenticated
  USING (public.research_study_editable(auth.uid(), study_id));

DROP POLICY IF EXISTS "Research questions: read" ON public.research_questions;
DROP POLICY IF EXISTS "Research questions: add" ON public.research_questions;
DROP POLICY IF EXISTS "Research questions: edit" ON public.research_questions;
DROP POLICY IF EXISTS "Research questions: remove" ON public.research_questions;
CREATE POLICY "Research questions: read" ON public.research_questions FOR SELECT TO authenticated
  USING (public.research_study_readable(auth.uid(), study_id));
CREATE POLICY "Research questions: add" ON public.research_questions FOR INSERT TO authenticated
  WITH CHECK (public.research_study_editable(auth.uid(), study_id));
CREATE POLICY "Research questions: edit" ON public.research_questions FOR UPDATE TO authenticated
  USING (public.research_study_editable(auth.uid(), study_id))
  WITH CHECK (public.research_study_editable(auth.uid(), study_id));
CREATE POLICY "Research questions: remove" ON public.research_questions FOR DELETE TO authenticated
  USING (public.research_study_editable(auth.uid(), study_id));

DROP POLICY IF EXISTS "Research respondents: read" ON public.research_respondents;
DROP POLICY IF EXISTS "Research responses: read" ON public.research_responses;
CREATE POLICY "Research respondents: read" ON public.research_respondents FOR SELECT TO authenticated
  USING (public.research_study_readable(auth.uid(), study_id));
CREATE POLICY "Research responses: read" ON public.research_responses FOR SELECT TO authenticated
  USING (public.research_study_readable(auth.uid(), study_id));

-- Allowances: the brand's people can see theirs; only super admins set them, because units are Pulse's AI spend.
DROP POLICY IF EXISTS "Research allowances: read" ON public.research_allowances;
DROP POLICY IF EXISTS "Research allowances: set" ON public.research_allowances;
DROP POLICY IF EXISTS "Research allowances: change" ON public.research_allowances;
CREATE POLICY "Research allowances: read" ON public.research_allowances FOR SELECT TO authenticated
  USING (public.can_access_research(auth.uid(), client_id));
CREATE POLICY "Research allowances: set" ON public.research_allowances FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "Research allowances: change" ON public.research_allowances FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ---------------------------------------------------------------- media

CREATE OR REPLACE FUNCTION public.research_media_client(_object_name text)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN split_part(_object_name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN split_part(_object_name, '/', 1)::uuid
  END
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('research-media', 'research-media', false, 52428800, ARRAY[
  'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'
])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Research media: read" ON storage.objects;
DROP POLICY IF EXISTS "Research media: upload" ON storage.objects;
DROP POLICY IF EXISTS "Research media: remove" ON storage.objects;
CREATE POLICY "Research media: read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'research-media' AND public.can_access_research(auth.uid(), public.research_media_client(name)));
CREATE POLICY "Research media: upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'research-media' AND public.can_access_research(auth.uid(), public.research_media_client(name)));
CREATE POLICY "Research media: remove" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'research-media' AND public.can_access_research(auth.uid(), public.research_media_client(name)));

-- ---------------------------------------------------------------- the job

INSERT INTO public.internal_job_keys(name) VALUES ('research-run') ON CONFLICT (name) DO NOTHING;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'research-run-minutely';
SELECT cron.schedule('research-run-minutely', '* * * * *',
  $$SELECT public.invoke_job_function('research-run', '{}'::jsonb)$$);
