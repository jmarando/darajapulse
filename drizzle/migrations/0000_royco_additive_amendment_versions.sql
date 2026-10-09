ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS contract_start_date date, ADD COLUMN IF NOT EXISTS contract_end_date date, ADD COLUMN IF NOT EXISTS historical_start_date date, ADD COLUMN IF NOT EXISTS payment_eligibility_notes text;
COMMENT ON COLUMN public.campaigns.contract_start_date IS 'Display and optional reporting only. Does not limit historical reads or payment eligibility.';
CREATE TABLE public.contract_amendments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),campaign_id uuid NOT NULL REFERENCES public.campaigns(id),title text NOT NULL,body text NOT NULL,contract_start_date date NOT NULL,contract_end_date date NOT NULL,active boolean NOT NULL DEFAULT false,logo_url text,created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.contract_amendments TO authenticated;
GRANT ALL ON public.contract_amendments TO service_role;
ALTER TABLE public.contract_amendments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Campaign staff read amendments" ON public.contract_amendments FOR SELECT TO authenticated USING(public.agency_staff_on_campaign(auth.uid(),campaign_id) OR public.is_super_admin(auth.uid()));
CREATE UNIQUE INDEX contract_amendments_one_active ON public.contract_amendments(campaign_id) WHERE active;
CREATE TABLE public.contract_amendment_signatures(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),amendment_id uuid NOT NULL REFERENCES public.contract_amendments(id),campaign_influencer_id uuid NOT NULL REFERENCES public.campaign_influencers(id),supersedes_signature_id uuid NOT NULL REFERENCES public.contract_signatures(id),contract_text text NOT NULL,contract_hash text NOT NULL,signer_name text NOT NULL,signature_data_url text,user_agent text,signed_at timestamptz NOT NULL DEFAULT now(),pdf_path text,emailed_at timestamptz,processing_at timestamptz,retry_after timestamptz,last_error text,UNIQUE(amendment_id,campaign_influencer_id));
GRANT SELECT ON public.contract_amendment_signatures TO authenticated;
GRANT ALL ON public.contract_amendment_signatures TO service_role;
ALTER TABLE public.contract_amendment_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Campaign staff read amended signatures" ON public.contract_amendment_signatures FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.campaign_influencers ci WHERE ci.id=campaign_influencer_id AND(public.agency_staff_on_campaign(auth.uid(),ci.campaign_id) OR public.is_super_admin(auth.uid()))));
CREATE OR REPLACE FUNCTION public.render_contract_amendment(_ci_id uuid,_amendment_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE r record; a record; txt text;
BEGIN
 SELECT ci.*,c.name campaign_name,i.full_name,i.handle INTO r FROM public.campaign_influencers ci JOIN public.campaigns c ON c.id=ci.campaign_id JOIN public.influencers i ON i.id=ci.influencer_id WHERE ci.id=_ci_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO a FROM public.contract_amendments WHERE id=_amendment_id AND campaign_id=r.campaign_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 txt:=replace(a.body,'{{creator_name}}',coalesce(r.full_name,''));
 txt:=replace(txt,'{{handle}}',coalesce('@'||ltrim(r.handle,'@'),''));
 txt:=replace(txt,'{{campaign}}',r.campaign_name);
 txt:=replace(txt,'{{period}}',a.contract_start_date::text||' to '||a.contract_end_date::text);
 txt:=replace(txt,'{{governing_law}}','Republic of Kenya');
 RETURN jsonb_build_object('title',a.title,'text',txt,'hash',encode(extensions.digest(txt,'sha256'),'hex'),'amendment_id',a.id,'logo_url',a.logo_url);
END $$;
REVOKE ALL ON FUNCTION public.render_contract_amendment(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.render_contract_amendment(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.get_contract_amendment_by_token(_token text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE ci record; a record; s record; old record; doc jsonb;
BEGIN
 SELECT * INTO ci FROM public.campaign_influencers WHERE brief_token=_token LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO old FROM public.contract_signatures WHERE campaign_influencer_id=ci.id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO a FROM public.contract_amendments WHERE campaign_id=ci.campaign_id AND active;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO s FROM public.contract_amendment_signatures WHERE campaign_influencer_id=ci.id AND amendment_id=a.id;
 IF FOUND THEN RETURN jsonb_build_object('required',true,'signed',true,'amended',true,'title',a.title,'text',s.contract_text,'signer_name',s.signer_name,'signature_data_url',s.signature_data_url,'signed_at',s.signed_at,'amendment_signature_id',s.id,'logo_url',a.logo_url); END IF;
 doc:=public.render_contract_amendment(ci.id,a.id);
 RETURN doc||jsonb_build_object('required',true,'signed',false,'amended',true,'previous_signed_at',old.signed_at);
END $$;
REVOKE ALL ON FUNCTION public.get_contract_amendment_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_contract_amendment_by_token(text) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.sign_contract_amendment_by_token(_token text,_amendment_id uuid,_signer_name text,_signature_data_url text DEFAULT NULL,_user_agent text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; a record; old record; doc jsonb; sid uuid;
BEGIN
 IF _signer_name IS NULL OR length(btrim(_signer_name))<3 OR length(_signer_name)>250 THEN RAISE EXCEPTION 'Please type your full legal name'; END IF;
 IF _signature_data_url IS NOT NULL AND(length(_signature_data_url)>500000 OR _signature_data_url !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$') THEN RAISE EXCEPTION 'Please clear and redraw your signature'; END IF;
 SELECT * INTO r FROM public.campaign_influencers WHERE brief_token=_token LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid link'; END IF;
 SELECT * INTO old FROM public.contract_signatures WHERE campaign_influencer_id=r.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'No earlier signed agreement'; END IF;
 SELECT * INTO a FROM public.contract_amendments WHERE id=_amendment_id AND campaign_id=r.campaign_id AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'This amendment is not available for signing yet'; END IF;
 SELECT id INTO sid FROM public.contract_amendment_signatures WHERE amendment_id=a.id AND campaign_influencer_id=r.id;
 IF sid IS NOT NULL THEN RETURN jsonb_build_object('already_signed',true,'amendment_signature_id',sid); END IF;
 doc:=public.render_contract_amendment(r.id,a.id);
 INSERT INTO public.contract_amendment_signatures(amendment_id,campaign_influencer_id,supersedes_signature_id,contract_text,contract_hash,signer_name,signature_data_url,user_agent) VALUES(a.id,r.id,old.id,doc->>'text',doc->>'hash',btrim(_signer_name),_signature_data_url,left(_user_agent,2000)) RETURNING id INTO sid;
 RETURN jsonb_build_object('signed',true,'amendment_signature_id',sid);
END $$;
REVOKE ALL ON FUNCTION public.sign_contract_amendment_by_token(text,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_contract_amendment_by_token(text,uuid,text,text,text) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.claim_amendment_pdf_jobs() RETURNS SETOF public.contract_amendment_signatures LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 WITH pending AS(SELECT id FROM public.contract_amendment_signatures WHERE emailed_at IS NULL AND(retry_after IS NULL OR retry_after<now()) AND(processing_at IS NULL OR processing_at<now()-interval '10 minutes') ORDER BY signed_at LIMIT 10 FOR UPDATE SKIP LOCKED)
 UPDATE public.contract_amendment_signatures s SET processing_at=now() FROM pending WHERE s.id=pending.id RETURNING s.*;
$$;
REVOKE ALL ON FUNCTION public.claim_amendment_pdf_jobs() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_amendment_pdf_jobs() TO service_role;
CREATE OR REPLACE FUNCTION public.get_campaign_contract_dates(_token text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('contract_start_date',c.contract_start_date,'contract_end_date',c.contract_end_date,'historical_start_date',c.historical_start_date,'payment_eligibility_notes',c.payment_eligibility_notes) FROM public.campaigns c WHERE c.id=public.get_report_link_campaign(_token) OR c.id=public.get_payment_link_campaign(_token) OR c.id=(SELECT ci.campaign_id FROM public.campaign_influencers ci WHERE ci.brief_token=_token LIMIT 1) LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_campaign_contract_dates(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_campaign_contract_dates(text) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.wake_amendment_pdf_jobs() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k text;
BEGIN
 SELECT key INTO k FROM public.internal_job_keys WHERE name='royco-amendment';
 IF k IS NOT NULL THEN PERFORM net.http_post(url:='https://ucxlveehobmeywkiynpy.supabase.co/functions/v1/royco-amendment',headers:=jsonb_build_object('Content-Type','application/json','x-job-key',k),body:='{"action":"process"}'::jsonb); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.wake_amendment_pdf_jobs() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER wake_amendment_pdf_on_sign AFTER INSERT ON public.contract_amendment_signatures FOR EACH ROW EXECUTE FUNCTION public.wake_amendment_pdf_jobs();