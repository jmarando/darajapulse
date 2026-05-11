CREATE TABLE public.plan_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16),'hex'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.plan_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency manages plan_links" ON public.plan_links FOR ALL
  USING (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager'))
  WITH CHECK (public.has_role(auth.uid(),'agency_admin') OR public.has_role(auth.uid(),'account_manager'));

CREATE POLICY "Public reads active plan links" ON public.plan_links FOR SELECT USING (is_active = true);

CREATE POLICY "Public reads campaigns via active plan link" ON public.campaigns FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.plan_links pl WHERE pl.campaign_id = campaigns.id AND pl.is_active = true)
);
CREATE POLICY "Public reads clients via active plan link" ON public.clients FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.campaigns c JOIN public.plan_links pl ON pl.campaign_id = c.id WHERE c.client_id = clients.id AND pl.is_active = true)
);
CREATE POLICY "Public reads ci via active plan link" ON public.campaign_influencers FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.plan_links pl WHERE pl.campaign_id = campaign_influencers.campaign_id AND pl.is_active = true)
);
CREATE POLICY "Public reads influencers via active plan link" ON public.influencers FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.campaign_influencers ci JOIN public.plan_links pl ON pl.campaign_id = ci.campaign_id WHERE ci.influencer_id = influencers.id AND pl.is_active = true)
);
CREATE POLICY "Public reads brief_templates via active plan link" ON public.brief_templates FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.campaigns c JOIN public.plan_links pl ON pl.campaign_id = c.id WHERE c.brief_template_id = brief_templates.id AND pl.is_active = true)
);

CREATE INDEX idx_plan_links_campaign ON public.plan_links(campaign_id);
CREATE INDEX idx_plan_links_token ON public.plan_links(token);