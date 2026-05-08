-- Brief templates per client
CREATE TABLE public.brief_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  name text NOT NULL,
  objective text,
  brief text,
  hashtag text,
  content_format text,
  tone text,
  dos text[] DEFAULT '{}',
  donts text[] DEFAULT '{}',
  mandatory_mentions text[] DEFAULT '{}',
  hashtags_extra text[] DEFAULT '{}',
  references_urls text[] DEFAULT '{}',
  wht_percent numeric DEFAULT 5,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.brief_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency manages brief_templates"
  ON public.brief_templates FOR ALL
  USING (has_role(auth.uid(), 'agency_admin'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'agency_admin'::app_role) OR has_role(auth.uid(), 'account_manager'::app_role));

CREATE POLICY "Client users read their brief_templates"
  ON public.brief_templates FOR SELECT
  USING (user_has_client_access(auth.uid(), client_id));

CREATE INDEX idx_brief_templates_client ON public.brief_templates(client_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER brief_templates_touch
  BEFORE UPDATE ON public.brief_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Link from campaigns
ALTER TABLE public.campaigns ADD COLUMN brief_template_id uuid;

-- Update brief-by-token function to prefer template fields when linked
CREATE OR REPLACE FUNCTION public.get_brief_by_token(_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object(
    'ci_id', ci.id,
    'status', ci.status,
    'fee_kes', ci.fee_kes,
    'deliverables_count', ci.deliverables_count,
    'campaign', jsonb_build_object(
      'name', c.name,
      'brief', COALESCE(t.brief, c.brief),
      'objective', COALESCE(t.objective, c.objective),
      'hashtag', COALESCE(t.hashtag, c.hashtag),
      'start_date', c.start_date,
      'end_date', c.end_date,
      'dos', COALESCE(t.dos, c.dos),
      'donts', COALESCE(t.donts, c.donts),
      'mandatory_mentions', COALESCE(t.mandatory_mentions, c.mandatory_mentions),
      'hashtags_extra', COALESCE(t.hashtags_extra, c.hashtags_extra),
      'content_format', COALESCE(t.content_format, c.content_format),
      'tone', COALESCE(t.tone, c.tone),
      'references_urls', COALESCE(t.references_urls, c.references_urls),
      'wht_percent', COALESCE(t.wht_percent, c.wht_percent)
    ),
    'client', jsonb_build_object('name', cl.name),
    'influencer', jsonb_build_object('id', i.id, 'full_name', i.full_name, 'handle', i.handle)
  )
  FROM public.campaign_influencers ci
  JOIN public.campaigns c ON c.id = ci.campaign_id
  LEFT JOIN public.brief_templates t ON t.id = c.brief_template_id
  JOIN public.clients cl ON cl.id = c.client_id
  JOIN public.influencers i ON i.id = ci.influencer_id
  WHERE ci.brief_token = _token
  LIMIT 1;
$$;