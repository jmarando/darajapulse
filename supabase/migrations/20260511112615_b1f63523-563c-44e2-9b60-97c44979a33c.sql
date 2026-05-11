
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_brief_template_id_fkey
  FOREIGN KEY (brief_template_id) REFERENCES public.brief_templates(id) ON DELETE SET NULL;
