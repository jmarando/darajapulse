-- Share links for the organic report: a brand's report at /o/<token>, with no login.
--
-- What:
--   * brand_report_links: one live link per brand, same shape as report_links. Agency staff make and turn them off.
--     A visitor has no rights on the table.
--   * get_brand_report_rows_by_token: the report for the link's own brand, and nothing for a link that is off or unknown.
--     The brand comes from the link, never from the caller. It runs as a visitor, who is cut off at 3 seconds.
--
-- Checked with supabase/verify/brand_report_links.sql, including how long the visitor's call takes on realistic volumes.
--
-- To roll back:
--   DROP FUNCTION IF EXISTS public.get_brand_report_rows_by_token(text, date, date);
--   DROP TABLE IF EXISTS public.brand_report_links;

CREATE TABLE IF NOT EXISTS public.brand_report_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS brand_report_links_one_live_idx ON public.brand_report_links (client_id) WHERE is_active;

ALTER TABLE public.brand_report_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brand_report_links FROM anon, authenticated;
GRANT SELECT, INSERT (client_id), UPDATE (is_active) ON public.brand_report_links TO authenticated;

DROP POLICY IF EXISTS "Brand report links: read" ON public.brand_report_links;
DROP POLICY IF EXISTS "Brand report links: add" ON public.brand_report_links;
DROP POLICY IF EXISTS "Brand report links: turn off" ON public.brand_report_links;
CREATE POLICY "Brand report links: read" ON public.brand_report_links FOR SELECT TO authenticated
  USING (public.can_manage_brand_channels(auth.uid(), client_id));
CREATE POLICY "Brand report links: add" ON public.brand_report_links FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_brand_channels(auth.uid(), client_id));
CREATE POLICY "Brand report links: turn off" ON public.brand_report_links FOR UPDATE TO authenticated
  USING (public.can_manage_brand_channels(auth.uid(), client_id))
  WITH CHECK (public.can_manage_brand_channels(auth.uid(), client_id));

CREATE OR REPLACE FUNCTION public.get_brand_report_rows_by_token(_token text, _from date, _to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _client uuid;
BEGIN
  SELECT l.client_id INTO _client FROM public.brand_report_links l WHERE l.token = _token AND l.is_active;
  IF _client IS NULL THEN
    RETURN NULL;
  END IF;
  IF _to < _from OR _to - _from > 366 THEN
    RAISE EXCEPTION 'Pick a period of up to a year.' USING ERRCODE = '22023';
  END IF;
  RETURN public.brand_report_doc(_client, _from, _to);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_brand_report_rows_by_token(text, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_brand_report_rows_by_token(text, date, date) TO anon, authenticated;
