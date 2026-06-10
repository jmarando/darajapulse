
CREATE OR REPLACE FUNCTION public.set_agency_id_from_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _aid uuid;
BEGIN
  IF NEW.agency_id IS NULL THEN
    SELECT agency_id INTO _aid FROM public.user_roles
    WHERE user_id = auth.uid() AND agency_id IS NOT NULL
      AND role IN ('agency_admin','account_manager')
    LIMIT 1;
    IF _aid IS NULL THEN
      SELECT id INTO _aid FROM public.agencies WHERE is_default LIMIT 1;
    END IF;
    NEW.agency_id := _aid;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_clients_set_agency        BEFORE INSERT ON public.clients         FOR EACH ROW EXECUTE FUNCTION public.set_agency_id_from_user();
CREATE TRIGGER trg_campaigns_set_agency      BEFORE INSERT ON public.campaigns       FOR EACH ROW EXECUTE FUNCTION public.set_agency_id_from_user();
CREATE TRIGGER trg_contests_set_agency       BEFORE INSERT ON public.contests        FOR EACH ROW EXECUTE FUNCTION public.set_agency_id_from_user();
CREATE TRIGGER trg_influencers_set_agency    BEFORE INSERT ON public.influencers     FOR EACH ROW EXECUTE FUNCTION public.set_agency_id_from_user();
CREATE TRIGGER trg_briefs_set_agency         BEFORE INSERT ON public.brief_templates FOR EACH ROW EXECUTE FUNCTION public.set_agency_id_from_user();
