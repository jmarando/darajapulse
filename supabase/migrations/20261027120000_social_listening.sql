-- Social listening: brands and their agency track keywords, competitors and
-- categories across TikTok, YouTube and Reddit, with the mood of each mention.
-- Adapted from Groundwork's listening (listening_topics / listening_mentions /
-- take_social_credits), scoped to a client brand instead of a campaign.
--
-- Who can do what
--   Agency staff of the client's agency, super admins, and the brand's own
--   portal users (client_members) can read the brand's listening and add, edit
--   or remove its keywords. Mentions are written only by the listening-sweep
--   edge function (service role).
--
-- Credits
--   Each keyword search costs 3 ScrapeCreators credits (TikTok, YouTube,
--   Reddit). An agency's brands share 300 credits per Nairobi day
--   (take_listening_credits), so one busy brand can't use up the key for
--   every other tenant. Searches are logged to scraper_credit_log.
--
-- Schedule
--   listening-sweep runs hourly through invoke_job_function and searches each
--   active keyword at most every 12 hours; a new keyword is searched on the
--   next run. Each brand can keep up to 15 active keywords.
--
-- To roll back: unschedule listening-sweep-hourly, delete its internal_job_keys
-- row, then drop the tables and functions created here.

CREATE TABLE IF NOT EXISTS public.listening_topics (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  kind             text NOT NULL DEFAULT 'brand' CHECK (kind IN ('brand', 'competitor', 'category')),
  label            text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 60),
  query            text NOT NULL CHECK (length(btrim(query)) BETWEEN 2 AND 80),
  exclude_terms    text[] NOT NULL DEFAULT '{}' CHECK (cardinality(exclude_terms) <= 10),
  active           boolean NOT NULL DEFAULT true,
  last_scanned_at  timestamptz,
  last_note        text,
  created_by       uuid DEFAULT auth.uid(),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listening_topics_client_idx ON public.listening_topics (client_id);
CREATE INDEX IF NOT EXISTS listening_topics_due_idx ON public.listening_topics (last_scanned_at NULLS FIRST) WHERE active;

CREATE TABLE IF NOT EXISTS public.listening_mentions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  topic_id         uuid NOT NULL REFERENCES public.listening_topics(id) ON DELETE CASCADE,
  source           text NOT NULL,
  url              text NOT NULL,
  title            text,
  snippet          text,
  author           text,
  reach            bigint,
  shares           bigint,
  published_at     timestamptz,
  found_at         timestamptz NOT NULL DEFAULT now(),
  sentiment        text CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  sentiment_score  real CHECK (sentiment_score BETWEEN -1 AND 1),
  theme            text CHECK (length(theme) <= 40),
  -- The same post can matter to two keywords (a brand and its competitor).
  UNIQUE (topic_id, url)
);
CREATE INDEX IF NOT EXISTS listening_mentions_client_idx ON public.listening_mentions (client_id, found_at DESC);
CREATE INDEX IF NOT EXISTS listening_mentions_unread_idx ON public.listening_mentions (found_at DESC) WHERE sentiment IS NULL;

CREATE TABLE IF NOT EXISTS public.listening_credits (
  agency_id  uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  day        date NOT NULL,
  used       integer NOT NULL DEFAULT 0 CHECK (used >= 0),
  PRIMARY KEY (agency_id, day)
);

-- Agency staff of the brand's agency, super admins, or the brand's portal users.
CREATE OR REPLACE FUNCTION public.can_access_listening(_user_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_super_admin(_user_id)
      OR public.user_has_client_access(_user_id, _client_id)
      OR EXISTS (
        SELECT 1 FROM public.clients c
        JOIN public.user_roles ur
          ON ur.user_id = _user_id
         AND ur.agency_id = c.agency_id
         AND ur.role IN ('agency_admin', 'account_manager')
       WHERE c.id = _client_id
      );
$function$;
REVOKE EXECUTE ON FUNCTION public.can_access_listening(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_listening(uuid, uuid) TO authenticated, service_role;

ALTER TABLE public.listening_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listening_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listening_credits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.listening_topics FROM anon;
REVOKE ALL ON public.listening_mentions FROM anon;
REVOKE ALL ON public.listening_credits FROM anon, authenticated;

DROP POLICY IF EXISTS "Listening keywords: read" ON public.listening_topics;
DROP POLICY IF EXISTS "Listening keywords: add" ON public.listening_topics;
DROP POLICY IF EXISTS "Listening keywords: edit" ON public.listening_topics;
DROP POLICY IF EXISTS "Listening keywords: remove" ON public.listening_topics;
CREATE POLICY "Listening keywords: read" ON public.listening_topics FOR SELECT TO authenticated
  USING (public.can_access_listening(auth.uid(), client_id));
CREATE POLICY "Listening keywords: add" ON public.listening_topics FOR INSERT TO authenticated
  WITH CHECK (public.can_access_listening(auth.uid(), client_id));
CREATE POLICY "Listening keywords: edit" ON public.listening_topics FOR UPDATE TO authenticated
  USING (public.can_access_listening(auth.uid(), client_id))
  WITH CHECK (public.can_access_listening(auth.uid(), client_id));
CREATE POLICY "Listening keywords: remove" ON public.listening_topics FOR DELETE TO authenticated
  USING (public.can_access_listening(auth.uid(), client_id));

DROP POLICY IF EXISTS "Listening mentions: read" ON public.listening_mentions;
CREATE POLICY "Listening mentions: read" ON public.listening_mentions FOR SELECT TO authenticated
  USING (public.can_access_listening(auth.uid(), client_id));

-- Signed-in users read mentions and manage keywords (the policies above decide
-- whose). They may set what a keyword searches for and whether it runs; the
-- sweep's own columns and the brand stay as they were.
REVOKE ALL ON public.listening_topics, public.listening_mentions FROM authenticated;
GRANT SELECT ON public.listening_mentions TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.listening_topics TO authenticated;
GRANT UPDATE (kind, label, query, exclude_terms, active) ON public.listening_topics TO authenticated;

-- At most 15 active keywords per brand, so a brand's list stays within what the
-- daily credits can search.
CREATE OR REPLACE FUNCTION public.listening_topics_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.active AND (TG_OP = 'INSERT' OR NOT OLD.active OR NEW.client_id <> OLD.client_id) THEN
    IF (SELECT count(*) FROM public.listening_topics
         WHERE client_id = NEW.client_id AND active AND id <> NEW.id) >= 15 THEN
      RAISE EXCEPTION 'A brand can have up to 15 active listening keywords. Pause or remove one first.';
    END IF;
  END IF;
  NEW.label := btrim(NEW.label);
  NEW.query := btrim(NEW.query);
  NEW.exclude_terms := ARRAY(SELECT DISTINCT btrim(t) FROM unnest(NEW.exclude_terms) t WHERE btrim(t) <> '');
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS listening_topics_limit ON public.listening_topics;
CREATE TRIGGER listening_topics_limit BEFORE INSERT OR UPDATE ON public.listening_topics
  FOR EACH ROW EXECUTE FUNCTION public.listening_topics_limit();

-- Take _n credits from the agency's allowance for today (Nairobi): true when
-- taken, false when that would pass _cap. Only the sweep calls it.
CREATE OR REPLACE FUNCTION public.take_listening_credits(_agency_id uuid, _n integer, _cap integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _day date := (now() AT TIME ZONE 'Africa/Nairobi')::date;
  _ok boolean;
BEGIN
  IF _n <= 0 THEN
    RETURN true;
  END IF;
  INSERT INTO public.listening_credits (agency_id, day) VALUES (_agency_id, _day)
  ON CONFLICT (agency_id, day) DO NOTHING;
  UPDATE public.listening_credits
     SET used = used + _n
   WHERE agency_id = _agency_id AND day = _day AND used + _n <= _cap
  RETURNING true INTO _ok;
  RETURN coalesce(_ok, false);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.take_listening_credits(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.take_listening_credits(uuid, integer, integer) TO service_role;

-- Today's listening credits used by the brand's agency, for the Keywords tab.
CREATE OR REPLACE FUNCTION public.listening_credits_today(_client_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.can_access_listening(auth.uid(), _client_id) THEN
    COALESCE((SELECT lc.used FROM public.listening_credits lc
                JOIN public.clients c ON c.agency_id = lc.agency_id
               WHERE c.id = _client_id
                 AND lc.day = (now() AT TIME ZONE 'Africa/Nairobi')::date), 0)
  END;
$function$;
REVOKE EXECUTE ON FUNCTION public.listening_credits_today(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listening_credits_today(uuid) TO authenticated, service_role;

-- Hourly sweep, authenticated with its own job key.
INSERT INTO public.internal_job_keys(name) VALUES ('listening-sweep') ON CONFLICT (name) DO NOTHING;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'listening-sweep-hourly';
SELECT cron.schedule('listening-sweep-hourly', '25 * * * *',
  $$SELECT public.invoke_job_function('listening-sweep', '{}'::jsonb)$$);
