
CREATE OR REPLACE FUNCTION public.render_contract(_ci_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  r record;
  t record;
  txt text;
BEGIN
  SELECT ci.id, ci.fee_kes, ci.deliverables_count, c.id AS campaign_id, c.name AS campaign_name,
         c.start_date, c.end_date, c.hashtag, c.wht_percent, c.contract_template_id,
         cl.name AS client_name, i.full_name, i.handle, i.id AS influencer_id
    INTO r
    FROM public.campaign_influencers ci
    JOIN public.campaigns c ON c.id = ci.campaign_id
    JOIN public.clients cl ON cl.id = c.client_id
    JOIN public.influencers i ON i.id = ci.influencer_id
   WHERE ci.id = _ci_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO t FROM public.contract_templates ct WHERE ct.id = r.contract_template_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  txt := t.body;
  txt := replace(txt, '{{creator_name}}', COALESCE(r.full_name, ''));
  txt := replace(txt, '{{handle}}', COALESCE('@' || ltrim(r.handle, '@'), ''));
  txt := replace(txt, '{{fee}}', 'KES ' || to_char(COALESCE(r.fee_kes, 0), 'FM999,999,999'));
  txt := replace(txt, '{{deliverables}}', COALESCE(r.deliverables_count, 0)::text);
  txt := replace(txt, '{{campaign}}', COALESCE(r.campaign_name, ''));
  txt := replace(txt, '{{client}}', COALESCE(r.client_name, ''));
  txt := replace(txt, '{{hashtag}}', COALESCE(r.hashtag, ''));
  txt := replace(txt, '{{wht}}', COALESCE(r.wht_percent, 0)::text || '%');
  txt := replace(txt, '{{period}}', COALESCE(r.start_date::text, '') || ' to ' || COALESCE(r.end_date::text, ''));
  txt := replace(txt, '{{exclusivity}}', COALESCE(t.exclusivity, ''));
  txt := replace(txt, '{{governing_law}}', COALESCE(t.governing_law, 'Republic of Kenya'));
  txt := replace(txt, '{{today}}', to_char(now(), 'DD Mon YYYY'));

  RETURN jsonb_build_object(
    'template_id', t.id,
    'title', t.name,
    'text', txt,
    'hash', encode(extensions.digest(txt, 'sha256'), 'hex')
  );
END $$;
