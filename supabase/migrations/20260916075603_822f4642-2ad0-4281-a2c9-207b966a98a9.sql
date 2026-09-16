
CREATE TABLE public.campaign_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  influencer_id uuid REFERENCES public.influencers(id) ON DELETE SET NULL,
  title text NOT NULL,
  content_type text,
  description text,
  source_draft_id uuid REFERENCES public.creator_drafts(id) ON DELETE SET NULL,
  expected_platforms text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'published',
  due_date date,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_deliverables TO authenticated;
GRANT SELECT ON public.campaign_deliverables TO anon;
GRANT ALL ON public.campaign_deliverables TO service_role;

ALTER TABLE public.campaign_deliverables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Campaign members manage deliverables"
ON public.campaign_deliverables FOR ALL TO authenticated
USING (public.user_has_campaign_access(auth.uid(), campaign_id))
WITH CHECK (public.user_has_campaign_access(auth.uid(), campaign_id));

CREATE POLICY "Public report links can read deliverables"
ON public.campaign_deliverables FOR SELECT TO anon, authenticated
USING (public.campaign_has_active_report_link(campaign_id));

CREATE INDEX idx_campaign_deliverables_campaign ON public.campaign_deliverables(campaign_id);
CREATE INDEX idx_campaign_deliverables_influencer ON public.campaign_deliverables(influencer_id);

CREATE TRIGGER campaign_deliverables_updated_at
BEFORE UPDATE ON public.campaign_deliverables
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.posts ADD COLUMN deliverable_id uuid REFERENCES public.campaign_deliverables(id) ON DELETE SET NULL;
CREATE INDEX idx_posts_deliverable ON public.posts(deliverable_id);

CREATE TABLE public.deliverable_link_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  influencer_id uuid REFERENCES public.influencers(id) ON DELETE SET NULL,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  other_post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  reason text,
  confidence numeric,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, other_post_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deliverable_link_suggestions TO authenticated;
GRANT ALL ON public.deliverable_link_suggestions TO service_role;

ALTER TABLE public.deliverable_link_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Campaign members manage link suggestions"
ON public.deliverable_link_suggestions FOR ALL TO authenticated
USING (public.user_has_campaign_access(auth.uid(), campaign_id))
WITH CHECK (public.user_has_campaign_access(auth.uid(), campaign_id));

CREATE INDEX idx_deliverable_suggestions_campaign ON public.deliverable_link_suggestions(campaign_id, status);

CREATE TRIGGER deliverable_link_suggestions_updated_at
BEFORE UPDATE ON public.deliverable_link_suggestions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Normalised caption key used for grouping
CREATE OR REPLACE FUNCTION public.caption_key(_s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT left(regexp_replace(lower(coalesce(_s, '')), '[^a-z0-9]', '', 'g'), 80)
$$;

-- Backfill: group cross-platform posts that share campaign, creator and caption
DO $backfill$
DECLARE
  r record;
  new_id uuid;
BEGIN
  FOR r IN
    SELECT campaign_id, influencer_id, public.caption_key(caption) AS ck,
           array_agg(id ORDER BY coalesce(posted_at, created_at)) AS ids,
           min(coalesce(posted_at, created_at)) AS first_at,
           max(coalesce(posted_at, created_at)) AS last_at,
           count(DISTINCT platform) AS plats,
           count(*) AS n,
           min(caption) AS cap
    FROM public.posts
    WHERE caption IS NOT NULL AND length(public.caption_key(caption)) >= 25
    GROUP BY 1, 2, 3
    HAVING count(*) > 1 AND count(DISTINCT platform) = count(*)
  LOOP
    IF r.last_at - r.first_at > interval '14 days' THEN
      CONTINUE;
    END IF;
    INSERT INTO public.campaign_deliverables (campaign_id, influencer_id, title, content_type, description, expected_platforms, status)
    VALUES (
      r.campaign_id, r.influencer_id,
      left(regexp_replace(coalesce(r.cap, 'Deliverable'), '\s+', ' ', 'g'), 80),
      'video', r.cap,
      (SELECT array_agg(DISTINCT platform::text) FROM public.posts WHERE id = ANY(r.ids)),
      'published'
    )
    RETURNING id INTO new_id;
    UPDATE public.posts SET deliverable_id = new_id WHERE id = ANY(r.ids);
  END LOOP;

  -- Every remaining post becomes its own deliverable
  FOR r IN SELECT * FROM public.posts WHERE deliverable_id IS NULL LOOP
    INSERT INTO public.campaign_deliverables (campaign_id, influencer_id, title, content_type, description, expected_platforms, status)
    VALUES (
      r.campaign_id, r.influencer_id,
      left(regexp_replace(coalesce(nullif(trim(r.caption), ''), 'Untitled post'), '\s+', ' ', 'g'), 80),
      'video', r.caption, ARRAY[r.platform::text], 'published'
    )
    RETURNING id INTO new_id;
    UPDATE public.posts SET deliverable_id = new_id WHERE id = r.id;
  END LOOP;
END
$backfill$;

-- New posts without a deliverable get one automatically
CREATE OR REPLACE FUNCTION public.posts_attach_deliverable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  match_id uuid;
  new_id uuid;
BEGIN
  IF NEW.deliverable_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.caption IS NOT NULL AND length(public.caption_key(NEW.caption)) >= 25 THEN
    SELECT p.deliverable_id INTO match_id
    FROM public.posts p
    WHERE p.campaign_id = NEW.campaign_id
      AND p.influencer_id = NEW.influencer_id
      AND p.deliverable_id IS NOT NULL
      AND p.platform <> NEW.platform
      AND public.caption_key(p.caption) = public.caption_key(NEW.caption)
      AND abs(extract(epoch FROM (coalesce(p.posted_at, p.created_at) - coalesce(NEW.posted_at, now())))) < 1209600
    LIMIT 1;
  END IF;

  IF match_id IS NOT NULL THEN
    NEW.deliverable_id := match_id;
    UPDATE public.campaign_deliverables
      SET expected_platforms = (SELECT array_agg(DISTINCT x) FROM unnest(expected_platforms || ARRAY[NEW.platform::text]) x)
      WHERE id = match_id;
    RETURN NEW;
  END IF;

  INSERT INTO public.campaign_deliverables (campaign_id, influencer_id, title, content_type, description, expected_platforms, status)
  VALUES (
    NEW.campaign_id, NEW.influencer_id,
    left(regexp_replace(coalesce(nullif(trim(NEW.caption), ''), 'Untitled post'), '\s+', ' ', 'g'), 80),
    'video', NEW.caption, ARRAY[NEW.platform::text], 'published'
  )
  RETURNING id INTO new_id;
  NEW.deliverable_id := new_id;
  RETURN NEW;
END
$$;

CREATE TRIGGER posts_attach_deliverable_trg
BEFORE INSERT ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.posts_attach_deliverable();
