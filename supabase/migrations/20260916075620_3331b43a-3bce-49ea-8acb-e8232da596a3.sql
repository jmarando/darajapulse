
CREATE OR REPLACE FUNCTION public.caption_key(_s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT left(regexp_replace(lower(coalesce(_s, '')), '[^a-z0-9]', '', 'g'), 80)
$$;

REVOKE ALL ON FUNCTION public.caption_key(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.posts_attach_deliverable() FROM PUBLIC, anon, authenticated;
