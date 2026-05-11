
-- Make contest submission_token a human-readable slug derived from the hashtag

CREATE OR REPLACE FUNCTION public.contest_set_slug_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  base text;
  candidate text;
  suffix int := 0;
BEGIN
  -- Only auto-generate on insert when token not explicitly provided as a custom slug
  IF TG_OP = 'INSERT' THEN
    base := lower(regexp_replace(coalesce(NEW.hashtag, NEW.name, 'contest'), '[^a-zA-Z0-9]+', '-', 'g'));
    base := trim(both '-' from base);
    IF base = '' THEN base := 'contest'; END IF;
    candidate := base;
    WHILE EXISTS (SELECT 1 FROM public.contests WHERE submission_token = candidate AND id <> NEW.id) LOOP
      suffix := suffix + 1;
      candidate := base || '-' || suffix::text;
    END LOOP;
    NEW.submission_token := candidate;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contest_set_slug_token ON public.contests;
CREATE TRIGGER trg_contest_set_slug_token
BEFORE INSERT ON public.contests
FOR EACH ROW
EXECUTE FUNCTION public.contest_set_slug_token();

-- Backfill existing contests with hex-token slugs
DO $$
DECLARE
  r RECORD;
  base text;
  candidate text;
  suffix int;
BEGIN
  FOR r IN SELECT id, hashtag, name FROM public.contests WHERE submission_token ~ '^[a-f0-9]{32}$' LOOP
    base := lower(regexp_replace(coalesce(r.hashtag, r.name, 'contest'), '[^a-zA-Z0-9]+', '-', 'g'));
    base := trim(both '-' from base);
    IF base = '' THEN base := 'contest'; END IF;
    candidate := base;
    suffix := 0;
    WHILE EXISTS (SELECT 1 FROM public.contests WHERE submission_token = candidate AND id <> r.id) LOOP
      suffix := suffix + 1;
      candidate := base || '-' || suffix::text;
    END LOOP;
    UPDATE public.contests SET submission_token = candidate WHERE id = r.id;
  END LOOP;
END $$;
