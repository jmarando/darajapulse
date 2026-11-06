-- Brand channels: connecting a brand's Facebook pages and Instagram accounts, with their tokens in Vault.
--
-- Why: connected channels read Meta's official numbers. A token must never be readable from the browser or by another
-- agency, so tokens live only in vault.secrets, behind tables and functions no signed-in user can reach.
--
-- What:
--   * brand_channel_secrets: which vault secret holds a channel's token. Server only.
--   * brand_connect_links: a no-login link staff can send on WhatsApp. Lasts 7 days. Manage rule.
--   * brand_oauth_states: a login in progress. Single use, an hour at most. Server only.
--   * brand_connect_pending: what a login shared while the person ticks this brand's accounts. Holds the login token's
--     vault id and no other token. Server only, an hour at most.
--   * brand_drop_vault_secret: deleting a row that holds a secret deletes the secret, cascades included.
--   * Service role only (PostgREST exposes no other schema, so execute rights are the guard, as with take_job_lock):
--     set_brand_channel_token, brand_channel_token, create_brand_connect_pending, brand_connect_pending_token,
--     clear_brand_connect_expired, revoke_brand_tokens_for_meta_user.
--   * get_brand_connect_link: a link's status and names, for the page a visitor opens. Nothing else.
--   * disconnect_brand_channel: for anyone who can see the brand, its portal users included.
--
-- Checked with supabase/verify/brand_channel_connect.sql inside a rolled-back DO block.
--
-- To roll back (this deletes every stored token, and connected channels need connecting again):
--   UPDATE public.brand_channels SET source = 'public', status = 'ok', status_note = NULL WHERE source = 'connected';
--   DROP TABLE IF EXISTS public.brand_connect_pending, public.brand_channel_secrets, public.brand_oauth_states, public.brand_connect_links;
--   DROP FUNCTION IF EXISTS public.disconnect_brand_channel(uuid);
--   DROP FUNCTION IF EXISTS public.get_brand_connect_link(text);
--   DROP FUNCTION IF EXISTS public.revoke_brand_tokens_for_meta_user(text);
--   DROP FUNCTION IF EXISTS public.clear_brand_connect_expired();
--   DROP FUNCTION IF EXISTS public.brand_connect_pending_token(uuid, text);
--   DROP FUNCTION IF EXISTS public.create_brand_connect_pending(text, uuid, jsonb, text, text, text, text[], uuid);
--   DROP FUNCTION IF EXISTS public.brand_channel_token(uuid);
--   DROP FUNCTION IF EXISTS public.set_brand_channel_token(uuid, text, text, text[], text, text, uuid, text);
--   DROP FUNCTION IF EXISTS public.brand_drop_vault_secret();

CREATE TABLE IF NOT EXISTS public.brand_channel_secrets (
  channel_id       uuid PRIMARY KEY REFERENCES public.brand_channels(id) ON DELETE CASCADE,
  vault_secret_id  uuid NOT NULL,
  token_kind       text NOT NULL DEFAULT 'page' CHECK (token_kind IN ('system_user', 'page')),
  scopes           text[] NOT NULL DEFAULT '{}',
  meta_user_id     text,
  business_id      text,
  expires_at       timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brand_channel_secrets_meta_user_idx ON public.brand_channel_secrets (meta_user_id);

CREATE TABLE IF NOT EXISTS public.brand_connect_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  token         text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by    uuid DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '7 days',
  revoked_at    timestamptz,
  last_used_at  timestamptz
);
CREATE INDEX IF NOT EXISTS brand_connect_links_client_idx ON public.brand_connect_links (client_id);

CREATE TABLE IF NOT EXISTS public.brand_oauth_states (
  state            text PRIMARY KEY CHECK (length(state) = 64),
  client_id        uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  connect_link_id  uuid REFERENCES public.brand_connect_links(id) ON DELETE SET NULL,
  started_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brand_connect_pending (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state            text NOT NULL,
  client_id        uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  started_by       uuid,
  assets           jsonb NOT NULL,
  vault_secret_id  uuid NOT NULL,
  meta_user_id     text,
  person_name      text,
  scopes           text[] NOT NULL DEFAULT '{}',
  expires_at       timestamptz NOT NULL DEFAULT now() + interval '1 hour'
);

ALTER TABLE public.brand_channel_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_connect_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_connect_pending ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brand_channel_secrets FROM anon, authenticated;
REVOKE ALL ON public.brand_oauth_states FROM anon, authenticated;
REVOKE ALL ON public.brand_connect_pending FROM anon, authenticated;
REVOKE ALL ON public.brand_connect_links FROM anon, authenticated;
GRANT SELECT, INSERT (client_id), UPDATE (revoked_at) ON public.brand_connect_links TO authenticated;

DROP POLICY IF EXISTS "Brand connect links: read" ON public.brand_connect_links;
DROP POLICY IF EXISTS "Brand connect links: add" ON public.brand_connect_links;
DROP POLICY IF EXISTS "Brand connect links: cancel" ON public.brand_connect_links;
CREATE POLICY "Brand connect links: read" ON public.brand_connect_links FOR SELECT TO authenticated
  USING (public.can_manage_brand_channels(auth.uid(), client_id));
CREATE POLICY "Brand connect links: add" ON public.brand_connect_links FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_brand_channels(auth.uid(), client_id));
CREATE POLICY "Brand connect links: cancel" ON public.brand_connect_links FOR UPDATE TO authenticated
  USING (public.can_manage_brand_channels(auth.uid(), client_id))
  WITH CHECK (public.can_manage_brand_channels(auth.uid(), client_id));

-- A row that held a token is gone, so its token goes too.
CREATE OR REPLACE FUNCTION public.brand_drop_vault_secret()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM vault.secrets WHERE id = OLD.vault_secret_id;
  RETURN OLD;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.brand_drop_vault_secret() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS brand_channel_secrets_drop_vault ON public.brand_channel_secrets;
CREATE TRIGGER brand_channel_secrets_drop_vault AFTER DELETE ON public.brand_channel_secrets
  FOR EACH ROW EXECUTE FUNCTION public.brand_drop_vault_secret();
DROP TRIGGER IF EXISTS brand_connect_pending_drop_vault ON public.brand_connect_pending;
CREATE TRIGGER brand_connect_pending_drop_vault AFTER DELETE ON public.brand_connect_pending
  FOR EACH ROW EXECUTE FUNCTION public.brand_drop_vault_secret();

-- Stores a channel's token and marks it connected in one step, so a channel can't be connected without a token.
CREATE OR REPLACE FUNCTION public.set_brand_channel_token(_channel_id uuid, _token text, _kind text, _scopes text[], _meta_user_id text, _business_id text, _connected_by uuid, _connected_by_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _secret uuid;
BEGIN
  DELETE FROM public.brand_channel_secrets WHERE channel_id = _channel_id;
  _secret := vault.create_secret(_token, NULL, 'brand channel ' || _channel_id);
  INSERT INTO public.brand_channel_secrets (channel_id, vault_secret_id, token_kind, scopes, meta_user_id, business_id)
  VALUES (_channel_id, _secret, _kind, COALESCE(_scopes, '{}'), _meta_user_id, _business_id);
  UPDATE public.brand_channels
     SET source = 'connected', status = 'ok', status_note = NULL, connected_at = now(), connected_by = _connected_by, connected_by_name = _connected_by_name
   WHERE id = _channel_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.set_brand_channel_token(uuid, text, text, text[], text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_brand_channel_token(uuid, text, text, text[], text, text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.brand_channel_token(_channel_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT d.decrypted_secret
    FROM public.brand_channel_secrets s
    JOIN vault.decrypted_secrets d ON d.id = s.vault_secret_id
   WHERE s.channel_id = _channel_id;
$function$;
REVOKE EXECUTE ON FUNCTION public.brand_channel_token(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brand_channel_token(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.create_brand_connect_pending(_state text, _client_id uuid, _assets jsonb, _token text, _meta_user_id text, _person_name text, _scopes text[], _started_by uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _secret uuid;
  _id uuid;
BEGIN
  _secret := vault.create_secret(_token, NULL, 'brand connect login');
  INSERT INTO public.brand_connect_pending (state, client_id, started_by, assets, vault_secret_id, meta_user_id, person_name, scopes)
  VALUES (_state, _client_id, _started_by, _assets, _secret, _meta_user_id, _person_name, COALESCE(_scopes, '{}'))
  RETURNING id INTO _id;
  RETURN _id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.create_brand_connect_pending(text, uuid, jsonb, text, text, text, text[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_brand_connect_pending(text, uuid, jsonb, text, text, text, text[], uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.brand_connect_pending_token(_pending_id uuid, _state text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT d.decrypted_secret
    FROM public.brand_connect_pending p
    JOIN vault.decrypted_secrets d ON d.id = p.vault_secret_id
   WHERE p.id = _pending_id AND p.state = _state AND p.expires_at > now();
$function$;
REVOKE EXECUTE ON FUNCTION public.brand_connect_pending_token(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brand_connect_pending_token(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.clear_brand_connect_expired()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  DELETE FROM public.brand_connect_pending WHERE expires_at <= now();
  DELETE FROM public.brand_oauth_states WHERE created_at <= now() - interval '1 hour';
$function$;
REVOKE EXECUTE ON FUNCTION public.clear_brand_connect_expired() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_brand_connect_expired() TO service_role;

-- Someone removed the app in Facebook: their tokens go now, and those channels say so.
CREATE OR REPLACE FUNCTION public.revoke_brand_tokens_for_meta_user(_meta_user_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ids uuid[];
BEGIN
  SELECT array_agg(channel_id) INTO _ids FROM public.brand_channel_secrets WHERE meta_user_id = _meta_user_id;
  IF _ids IS NULL THEN
    RETURN 0;
  END IF;
  DELETE FROM public.brand_channel_secrets WHERE channel_id = ANY(_ids);
  UPDATE public.brand_channels SET status = 'needs_reconnect', status_note = 'Removed in Facebook settings' WHERE id = ANY(_ids);
  RETURN cardinality(_ids);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.revoke_brand_tokens_for_meta_user(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_brand_tokens_for_meta_user(text) TO service_role;

-- What the page behind a connect link needs, for whoever holds the link. Nothing for a token it doesn't know.
CREATE OR REPLACE FUNCTION public.get_brand_connect_link(_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
           'status', CASE WHEN l.revoked_at IS NOT NULL THEN 'cancelled' WHEN l.expires_at <= now() THEN 'expired' ELSE 'open' END,
           'brand_name', c.name,
           'brand_logo', c.logo_url,
           'agency_name', COALESCE(a.display_name, a.name)
         )
    FROM public.brand_connect_links l
    JOIN public.clients c ON c.id = l.client_id
    JOIN public.agencies a ON a.id = c.agency_id
   WHERE l.token = _token;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_brand_connect_link(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_brand_connect_link(text) TO anon, authenticated;

-- Back to public numbers, with the token gone straight away. What Meta alone could tell us about the audience goes too.
CREATE OR REPLACE FUNCTION public.disconnect_brand_channel(_channel_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _client uuid;
  _who text;
BEGIN
  SELECT client_id INTO _client FROM public.brand_channels WHERE id = _channel_id;
  IF _client IS NULL OR NOT public.can_view_brand_channels(auth.uid(), _client) THEN
    RAISE EXCEPTION 'You do not have access to this brand.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.brand_channel_secrets WHERE channel_id = _channel_id;
  SELECT NULLIF(btrim(full_name), '') INTO _who FROM public.profiles WHERE id = auth.uid();
  UPDATE public.brand_channels
     SET source = 'public', status = 'ok', status_note = 'Disconnected by ' || COALESCE(_who, 'a team member'),
         connected_at = NULL, connected_by = NULL, connected_by_name = NULL, audience = NULL, audience_at = NULL
   WHERE id = _channel_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.disconnect_brand_channel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disconnect_brand_channel(uuid) TO authenticated;
