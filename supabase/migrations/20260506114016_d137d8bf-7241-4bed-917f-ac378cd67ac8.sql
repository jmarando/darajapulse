-- Content module
CREATE TABLE public.content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  influencer_id uuid REFERENCES public.influencers(id) ON DELETE SET NULL,
  title text NOT NULL,
  platform public.platform NOT NULL DEFAULT 'tiktok',
  scheduled_for timestamptz,
  status text NOT NULL DEFAULT 'drafted',
  caption text,
  asset_url text,
  thumbnail_url text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_content_items_campaign ON public.content_items(campaign_id);
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency manages content_items" ON public.content_items FOR ALL
  USING (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager'))
  WITH CHECK (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager'));
CREATE POLICY "Public reads content_items via active link" ON public.content_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.report_links rl WHERE rl.campaign_id = content_items.campaign_id AND rl.is_active));

CREATE TABLE public.content_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  author_id uuid,
  author_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_content_comments_item ON public.content_comments(content_item_id);
ALTER TABLE public.content_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency manages content_comments" ON public.content_comments FOR ALL
  USING (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager'))
  WITH CHECK (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager'));
CREATE POLICY "Public reads content_comments via active link" ON public.content_comments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.content_items ci
    JOIN public.report_links rl ON rl.campaign_id = ci.campaign_id
    WHERE ci.id = content_comments.content_item_id AND rl.is_active));

-- Storage bucket for assets
INSERT INTO storage.buckets (id, name, public) VALUES ('campaign-assets','campaign-assets', false)
ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Agency reads campaign-assets" ON storage.objects FOR SELECT
  USING (bucket_id='campaign-assets' AND (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager')));
CREATE POLICY "Agency writes campaign-assets" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id='campaign-assets' AND (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager')));
CREATE POLICY "Agency updates campaign-assets" ON storage.objects FOR UPDATE
  USING (bucket_id='campaign-assets' AND (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager')));
CREATE POLICY "Agency deletes campaign-assets" ON storage.objects FOR DELETE
  USING (bucket_id='campaign-assets' AND (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager')));

-- Contest module
CREATE TABLE public.contests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  hashtag text NOT NULL,
  platforms text[] NOT NULL DEFAULT ARRAY['tiktok'],
  start_date date NOT NULL,
  end_date date NOT NULL,
  round_days integer NOT NULL DEFAULT 14,
  prize text,
  formula text NOT NULL DEFAULT 'weighted',
  submission_token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(16),'hex'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contests_campaign ON public.contests(campaign_id);
CREATE UNIQUE INDEX idx_contests_token ON public.contests(submission_token);
ALTER TABLE public.contests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency manages contests" ON public.contests FOR ALL
  USING (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager'))
  WITH CHECK (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager'));
CREATE POLICY "Public reads contests via active link or token" ON public.contests FOR SELECT
  USING (is_active AND (
    EXISTS (SELECT 1 FROM public.report_links rl WHERE rl.campaign_id = contests.campaign_id AND rl.is_active)
  ));

CREATE TABLE public.contest_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  influencer_id uuid REFERENCES public.influencers(id) ON DELETE SET NULL,
  platform public.platform NOT NULL,
  post_url text NOT NULL,
  handle text,
  caption text,
  thumbnail_url text,
  posted_at timestamptz,
  views integer DEFAULT 0,
  likes integer DEFAULT 0,
  comments integer DEFAULT 0,
  shares integer DEFAULT 0,
  saves integer DEFAULT 0,
  score numeric DEFAULT 0,
  round_number integer DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  source text NOT NULL DEFAULT 'manual',
  submitter_name text,
  submitter_email text,
  last_polled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contest_entries_contest ON public.contest_entries(contest_id);
CREATE INDEX idx_contest_entries_score ON public.contest_entries(contest_id, round_number, score DESC);
ALTER TABLE public.contest_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agency manages contest_entries" ON public.contest_entries FOR ALL
  USING (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager'))
  WITH CHECK (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager'));
CREATE POLICY "Public reads approved entries via report link" ON public.contest_entries FOR SELECT
  USING (status IN ('approved','winner') AND EXISTS (
    SELECT 1 FROM public.contests c
    JOIN public.report_links rl ON rl.campaign_id = c.campaign_id
    WHERE c.id = contest_entries.contest_id AND rl.is_active));

-- Public submission RPC (no auth, validated by token)
CREATE OR REPLACE FUNCTION public.submit_contest_entry(
  _token text,
  _platform text,
  _post_url text,
  _handle text,
  _submitter_name text,
  _submitter_email text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _contest_id uuid;
  _new_id uuid;
BEGIN
  SELECT id INTO _contest_id FROM public.contests WHERE submission_token = _token AND is_active LIMIT 1;
  IF _contest_id IS NULL THEN RAISE EXCEPTION 'invalid contest token'; END IF;
  IF _post_url IS NULL OR length(_post_url) < 8 THEN RAISE EXCEPTION 'post_url required'; END IF;
  INSERT INTO public.contest_entries (contest_id, platform, post_url, handle, submitter_name, submitter_email, source, status)
  VALUES (_contest_id, _platform::platform, _post_url, _handle, _submitter_name, _submitter_email, 'public_form', 'pending')
  RETURNING id INTO _new_id;
  RETURN _new_id;
END $$;

-- Public read of contest by token (for the submission page)
CREATE OR REPLACE FUNCTION public.get_contest_by_token(_token text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'name', c.name, 'hashtag', c.hashtag, 'platforms', c.platforms,
    'start_date', c.start_date, 'end_date', c.end_date, 'prize', c.prize,
    'campaign', jsonb_build_object('name', cm.name),
    'client', jsonb_build_object('name', cl.name, 'logo_url', cl.logo_url)
  )
  FROM public.contests c
  JOIN public.campaigns cm ON cm.id = c.campaign_id
  JOIN public.clients cl ON cl.id = cm.client_id
  WHERE c.submission_token = _token AND c.is_active LIMIT 1;
$$;