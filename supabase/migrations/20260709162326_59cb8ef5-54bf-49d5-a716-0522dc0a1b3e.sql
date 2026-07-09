CREATE TABLE public._contest_dedup_map(
  loser_id uuid PRIMARY KEY,
  keeper_id uuid NOT NULL
);
CREATE TABLE public._contest_dedup_keepers(
  keeper_id uuid PRIMARY KEY,
  cross_posts jsonb NOT NULL DEFAULT '[]'::jsonb,
  any_winner boolean NOT NULL DEFAULT false
);
GRANT ALL ON public._contest_dedup_map TO service_role, authenticated;
GRANT ALL ON public._contest_dedup_keepers TO service_role, authenticated;

CREATE OR REPLACE FUNCTION public._contest_apply_dedup()
RETURNS TABLE(winners_redirected int, keepers_updated int, losers_deleted int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_wr int; v_ku int; v_del int;
BEGIN
  WITH u AS (
    UPDATE public.contest_winners cw
       SET entry_id = m.keeper_id
      FROM public._contest_dedup_map m
     WHERE cw.entry_id = m.loser_id
    RETURNING 1
  ) SELECT COUNT(*) INTO v_wr FROM u;

  WITH u AS (
    UPDATE public.contest_entries e
       SET cross_posts = k.cross_posts,
           status = CASE WHEN k.any_winner AND e.status <> 'winner' THEN 'winner' ELSE e.status END
      FROM public._contest_dedup_keepers k
     WHERE e.id = k.keeper_id
    RETURNING 1
  ) SELECT COUNT(*) INTO v_ku FROM u;

  WITH d AS (
    DELETE FROM public.contest_entries e
     USING public._contest_dedup_map m
     WHERE e.id = m.loser_id
    RETURNING 1
  ) SELECT COUNT(*) INTO v_del FROM d;

  RETURN QUERY SELECT v_wr, v_ku, v_del;
END;
$fn$;