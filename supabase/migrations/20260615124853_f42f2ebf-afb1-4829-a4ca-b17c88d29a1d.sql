
-- 1) Durable winners table
CREATE TABLE IF NOT EXISTS public.contest_winners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  entry_id uuid REFERENCES public.contest_entries(id) ON DELETE SET NULL,
  round_number int NOT NULL,
  placement_rank int NOT NULL,
  placement text NOT NULL,
  prize text,
  full_name text,
  handle text,
  platform text,
  post_url text,
  thumbnail_url text,
  frozen_score numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contest_id, round_number, placement_rank)
);

GRANT SELECT ON public.contest_winners TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contest_winners TO authenticated;
GRANT ALL ON public.contest_winners TO service_role;

ALTER TABLE public.contest_winners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view contest winners"
  ON public.contest_winners FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users manage contest winners"
  ON public.contest_winners FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_contest_winners_contest ON public.contest_winners(contest_id);
CREATE INDEX IF NOT EXISTS idx_contest_winners_entry ON public.contest_winners(entry_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.contest_winners_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_contest_winners_updated_at ON public.contest_winners;
CREATE TRIGGER trg_contest_winners_updated_at
  BEFORE UPDATE ON public.contest_winners
  FOR EACH ROW EXECUTE FUNCTION public.contest_winners_set_updated_at();

-- 2) Self-healing trigger on contest_entries:
--    whenever a row that is officially a winner is inserted/updated,
--    force status='winner' and merge placement metadata back in.
CREATE OR REPLACE FUNCTION public.enforce_contest_winner_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE w public.contest_winners%ROWTYPE;
BEGIN
  SELECT * INTO w FROM public.contest_winners WHERE entry_id = NEW.id LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

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

DROP TRIGGER IF EXISTS trg_enforce_contest_winner ON public.contest_entries;
CREATE TRIGGER trg_enforce_contest_winner
  BEFORE INSERT OR UPDATE ON public.contest_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_contest_winner_status();

-- 3) Seed the 10 Royco winners (idempotent)
INSERT INTO public.contest_winners
  (contest_id, entry_id, round_number, placement_rank, placement, prize, full_name, handle)
VALUES
  -- Round 1
  ('531899fc-0c0a-45e5-afcf-211f48d8e6fd','fa19f2cc-ec1b-4ecf-adfa-c9b8ea02e1f2',1,1,'Winner','Luxury Get-away to Watamu for two + Hamper','Irene Nduku','irenenduku0'),
  ('531899fc-0c0a-45e5-afcf-211f48d8e6fd','550c0f06-baba-4b52-ae21-774bc92486c9',1,2,'1st Runners Up','Air Fryer + Hamper','Caroline wanjiru mwangi','carol_imwangi'),
  ('531899fc-0c0a-45e5-afcf-211f48d8e6fd','bbf98344-697a-476c-9f5a-208a9ae2a14d',1,3,'2nd Runners Up','Toaster + Hamper','Njagi Macharia Brian','lukanjagi'),
  ('531899fc-0c0a-45e5-afcf-211f48d8e6fd','c11dfc27-5ed1-4ffe-ac33-c151837aab35',1,4,'3rd Runners Up','Hamper','Gordon Muiruri','gordoncooks1'),
  ('531899fc-0c0a-45e5-afcf-211f48d8e6fd','cf7c91c3-92e4-4c8e-9979-5ab42476e4b1',1,5,'4th Runners Up','KSH 3,000 Naivas Voucher','Helvin Omondi','helvin_lifestyle'),
  -- Round 2
  ('531899fc-0c0a-45e5-afcf-211f48d8e6fd','cf2a5643-ffab-44ac-8388-30420b8cb9e9',2,1,'Winner',NULL,'Halima Weru','halymer.b'),
  ('531899fc-0c0a-45e5-afcf-211f48d8e6fd','5568cff4-e295-4ae6-84b4-c67b44fc9256',2,2,'1st Runners Up',NULL,'Sincere Njeri','nje.rey'),
  ('531899fc-0c0a-45e5-afcf-211f48d8e6fd','9632231a-b587-4c2b-b17a-a90c10a1fe5b',2,3,'2nd Runners Up',NULL,'Damaris Kentai','kentaidamaris'),
  ('531899fc-0c0a-45e5-afcf-211f48d8e6fd','cf250d08-0454-4db6-a160-32669268c851',2,4,'3rd Runners Up',NULL,'Esther Ndinda','estherndinda'),
  ('531899fc-0c0a-45e5-afcf-211f48d8e6fd','3e737734-88bd-46d8-9695-7ff920a5f6e7',2,5,'4th Runners Up',NULL,'Betty Wambua','queenbetty65_backup')
ON CONFLICT (contest_id, round_number, placement_rank) DO UPDATE
SET entry_id = EXCLUDED.entry_id,
    placement = EXCLUDED.placement,
    prize = COALESCE(EXCLUDED.prize, public.contest_winners.prize),
    full_name = EXCLUDED.full_name,
    handle = EXCLUDED.handle,
    updated_at = now();

-- 4) Force-heal all 10 entries right now (trigger will fill the rest)
UPDATE public.contest_entries
SET status = 'winner'
WHERE id IN (
  SELECT entry_id FROM public.contest_winners
  WHERE contest_id = '531899fc-0c0a-45e5-afcf-211f48d8e6fd' AND entry_id IS NOT NULL
);
