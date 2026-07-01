CREATE OR REPLACE FUNCTION public.enforce_contest_winner_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  w public.contest_winners%ROWTYPE;
  entry_handles text[];
  entry_name text;
BEGIN
  entry_handles := ARRAY_REMOVE(ARRAY[
    lower(regexp_replace(coalesce(NEW.handle, ''), '^@+', '')),
    lower(regexp_replace(coalesce(NEW.instagram_handle, ''), '^@+', '')),
    lower(regexp_replace(coalesce(NEW.tiktok_handle, ''), '^@+', '')),
    lower(regexp_replace(coalesce(NEW.facebook_handle, ''), '^@+', ''))
  ], '');
  entry_name := lower(regexp_replace(trim(coalesce(NEW.full_name, NEW.submitter_name, '')), '\s+', ' ', 'g'));

  SELECT * INTO w
  FROM public.contest_winners cw
  WHERE cw.contest_id = NEW.contest_id
    AND (
      cw.entry_id = NEW.id
      OR (
        cw.handle IS NOT NULL
        AND lower(regexp_replace(cw.handle, '^@+', '')) = ANY(entry_handles)
      )
      OR (
        cw.post_url IS NOT NULL
        AND NEW.post_url IS NOT NULL
        AND trim(cw.post_url) = trim(NEW.post_url)
      )
      OR (
        cw.full_name IS NOT NULL
        AND entry_name <> ''
        AND lower(regexp_replace(trim(cw.full_name), '\s+', ' ', 'g')) = entry_name
      )
    )
  ORDER BY (cw.entry_id = NEW.id) DESC, cw.round_number, cw.placement_rank
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  NEW.status := 'winner';
  NEW.round_number := COALESCE(NEW.round_number, w.round_number);
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
                  || jsonb_build_object(
                       'placement', w.placement,
                       'placement_rank', w.placement_rank,
                       'round', w.round_number,
                       'prize', w.prize
                     );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_contest_winner_to_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.entry_id IS NOT NULL THEN
    UPDATE public.contest_entries ce
    SET status = 'winner',
        round_number = COALESCE(ce.round_number, NEW.round_number),
        metadata = COALESCE(ce.metadata, '{}'::jsonb)
                   || jsonb_build_object(
                        'placement', NEW.placement,
                        'placement_rank', NEW.placement_rank,
                        'round', NEW.round_number,
                        'prize', NEW.prize
                      )
    WHERE ce.id = NEW.entry_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_contest_winner_to_entry ON public.contest_winners;
CREATE TRIGGER trg_apply_contest_winner_to_entry
  AFTER INSERT OR UPDATE OF entry_id, round_number, placement_rank, placement, prize
  ON public.contest_winners
  FOR EACH ROW EXECUTE FUNCTION public.apply_contest_winner_to_entry();

WITH damaris_reg AS (
  SELECT id, post_url, platform::text AS platform, score
  FROM public.contest_entries
  WHERE contest_id = '531899fc-0c0a-45e5-afcf-211f48d8e6fd'
    AND lower(coalesce(full_name, submitter_name, '')) LIKE 'damaris k%'
  ORDER BY score DESC NULLS LAST
  LIMIT 1
)
UPDATE public.contest_winners cw
SET entry_id = damaris_reg.id,
    post_url = damaris_reg.post_url,
    platform = damaris_reg.platform,
    frozen_score = GREATEST(coalesce(cw.frozen_score, 0), coalesce(damaris_reg.score, 0)),
    updated_at = now()
FROM damaris_reg
WHERE cw.contest_id = '531899fc-0c0a-45e5-afcf-211f48d8e6fd'
  AND cw.round_number = 2
  AND cw.placement_rank = 3
  AND (
    lower(coalesce(cw.full_name, '')) LIKE '%damaris%'
    OR lower(coalesce(cw.handle, '')) = 'kentaidamaris'
  );

UPDATE public.contest_entries ce
SET status = 'winner',
    round_number = COALESCE(ce.round_number, cw.round_number),
    metadata = COALESCE(ce.metadata, '{}'::jsonb)
               || jsonb_build_object(
                    'placement', cw.placement,
                    'placement_rank', cw.placement_rank,
                    'round', cw.round_number,
                    'prize', cw.prize
                  )
FROM public.contest_winners cw
WHERE cw.entry_id = ce.id;

REVOKE EXECUTE ON FUNCTION public.apply_contest_winner_to_entry() FROM anon, authenticated, public;