-- Checks for 20261106100000_brand_channel_connect.sql (tokens in Vault, links, disconnect).
-- Paste inside the dry-run DO block, after EXECUTE of the migration text. Every scratch row rolls back with the block.
-- It reads one real agency admin's id and one real portal user's id to act as them, and never prints them or a token.
DECLARE
  _agency_a uuid;
  _admin uuid;
  _portal uuid;
  _agency_b uuid := gen_random_uuid();
  _client_a uuid := gen_random_uuid();
  _client_b uuid := gen_random_uuid();
  _chan_a uuid := gen_random_uuid();
  _chan_b uuid := gen_random_uuid();
  _vault_before int;
  _pending uuid;
  _link uuid;
  _token text;
  _n int;
  _j jsonb;
  _t text;
BEGIN
  -- 1. Nobody signed in, and no visitor, reaches a table or function that holds a token.
  FOREACH _t IN ARRAY ARRAY['public.brand_channel_secrets', 'public.brand_oauth_states', 'public.brand_connect_pending'] LOOP
    IF has_table_privilege('authenticated', _t, 'SELECT') OR has_table_privilege('anon', _t, 'SELECT') THEN RAISE EXCEPTION '% can be read from outside', _t; END IF;
  END LOOP;
  IF has_table_privilege('anon', 'public.brand_connect_links', 'SELECT') THEN RAISE EXCEPTION 'anon can read connect links'; END IF;
  FOREACH _t IN ARRAY ARRAY['public.brand_channel_token(uuid)', 'public.brand_connect_pending_token(uuid, text)', 'public.set_brand_channel_token(uuid, text, text, text[], text, text, uuid, text)', 'public.create_brand_connect_pending(text, uuid, jsonb, text, text, text, text[], uuid)', 'public.revoke_brand_tokens_for_meta_user(text)'] LOOP
    IF has_function_privilege('authenticated', _t, 'EXECUTE') OR has_function_privilege('anon', _t, 'EXECUTE') THEN RAISE EXCEPTION '% can be called from outside', _t; END IF;
    IF NOT has_function_privilege('service_role', _t, 'EXECUTE') THEN RAISE EXCEPTION 'the service role cannot call %', _t; END IF;
  END LOOP;

  -- 2. Scratch brands.
  SELECT ur.user_id, ur.agency_id INTO _admin, _agency_a FROM public.user_roles ur
   WHERE ur.role = 'agency_admin' AND ur.agency_id IS NOT NULL AND NOT public.is_super_admin(ur.user_id) LIMIT 1;
  SELECT ur.user_id INTO _portal FROM public.user_roles ur
   WHERE ur.role = 'client_user' AND NOT EXISTS (SELECT 1 FROM public.user_roles o WHERE o.user_id = ur.user_id AND o.role IN ('super_admin', 'agency_admin', 'account_manager')) LIMIT 1;
  IF _admin IS NULL OR _portal IS NULL THEN RAISE EXCEPTION 'no real people to test with'; END IF;
  INSERT INTO public.agencies (id, name, slug) VALUES (_agency_b, 'Verify connect', 'verify-connect-' || left(_agency_b::text, 8));
  INSERT INTO public.clients (id, name, agency_id) VALUES (_client_a, 'Verify A', _agency_a), (_client_b, 'Verify B', _agency_b);
  INSERT INTO public.client_members (client_id, user_id) VALUES (_client_a, _portal);
  INSERT INTO public.brand_channels (id, client_id, platform, handle) VALUES (_chan_a, _client_a, 'facebook', 'verify.a'), (_chan_b, _client_b, 'facebook', 'verify.b');
  SELECT count(*) INTO _vault_before FROM vault.secrets;

  -- 3. A token goes in, reads back, replaces the old one, and the channel says connected.
  PERFORM public.set_brand_channel_token(_chan_a, 'fake-token-1', 'page', ARRAY['read_insights'], 'meta-user-1', NULL, NULL, 'A person');
  IF public.brand_channel_token(_chan_a) <> 'fake-token-1' THEN RAISE EXCEPTION 'the token did not read back'; END IF;
  PERFORM public.set_brand_channel_token(_chan_a, 'fake-token-2', 'page', ARRAY['read_insights'], 'meta-user-1', NULL, NULL, 'A person');
  IF public.brand_channel_token(_chan_a) <> 'fake-token-2' THEN RAISE EXCEPTION 'the new token did not replace the old one'; END IF;
  SELECT count(*) INTO _n FROM vault.secrets;
  IF _n <> _vault_before + 1 THEN RAISE EXCEPTION 'replacing a token left % extra vault rows', _n - _vault_before; END IF;
  SELECT count(*) INTO _n FROM public.brand_channels WHERE id = _chan_a AND source = 'connected' AND status = 'ok' AND connected_at IS NOT NULL AND connected_by_name = 'A person';
  IF _n <> 1 THEN RAISE EXCEPTION 'the channel was not marked connected'; END IF;

  -- 4. A portal user can disconnect their own brand's channel, not another's, and the token is gone.
  PERFORM public.set_brand_channel_token(_chan_b, 'fake-token-3', 'page', '{}', 'meta-user-2', NULL, NULL, 'B person');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _portal, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.disconnect_brand_channel(_chan_b);
    RAISE EXCEPTION 'a portal user disconnected another brand''s channel';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM public.disconnect_brand_channel(_chan_a);
  BEGIN
    SELECT count(*) INTO _n FROM public.brand_channel_secrets;
    RAISE EXCEPTION 'a signed-in user read the secrets table';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    _t := public.brand_channel_token(_chan_b);
    RAISE EXCEPTION 'a signed-in user read a token';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  IF public.brand_channel_token(_chan_a) IS NOT NULL THEN RAISE EXCEPTION 'disconnecting left the token behind'; END IF;
  SELECT count(*) INTO _n FROM public.brand_channels WHERE id = _chan_a AND source = 'public' AND status = 'ok' AND status_note LIKE 'Disconnected by %' AND connected_at IS NULL;
  IF _n <> 1 THEN RAISE EXCEPTION 'the channel did not go back to public numbers'; END IF;
  SELECT count(*) INTO _n FROM vault.secrets;
  IF _n <> _vault_before + 1 THEN RAISE EXCEPTION 'vault rows after disconnect: % extra, expected 1 (B)', _n - _vault_before; END IF;

  -- 5. Deleting a channel takes its token with it, and removing the app in Facebook does too.
  PERFORM public.set_brand_channel_token(_chan_a, 'fake-token-4', 'page', '{}', 'meta-user-1', NULL, NULL, 'A person');
  SELECT public.revoke_brand_tokens_for_meta_user('meta-user-1') INTO _n;
  IF _n <> 1 THEN RAISE EXCEPTION 'revoking found % channels', _n; END IF;
  SELECT count(*) INTO _n FROM public.brand_channels WHERE id = _chan_a AND status = 'needs_reconnect' AND status_note = 'Removed in Facebook settings';
  IF _n <> 1 THEN RAISE EXCEPTION 'the channel does not say it was removed in Facebook'; END IF;
  IF public.brand_channel_token(_chan_a) IS NOT NULL THEN RAISE EXCEPTION 'revoking left the token behind'; END IF;
  DELETE FROM public.brand_channels WHERE id = _chan_b;
  SELECT count(*) INTO _n FROM vault.secrets;
  IF _n <> _vault_before THEN RAISE EXCEPTION 'deleting a channel left its vault row'; END IF;

  -- 6. A login in progress: its token reads with the right state only, not once expired, and leaves nothing behind.
  _pending := public.create_brand_connect_pending(repeat('a', 64), _client_a, '[]'::jsonb, 'fake-login-token', 'meta-user-1', 'A person', ARRAY['read_insights'], NULL);
  IF public.brand_connect_pending_token(_pending, repeat('a', 64)) <> 'fake-login-token' THEN RAISE EXCEPTION 'the login token did not read back'; END IF;
  IF public.brand_connect_pending_token(_pending, repeat('b', 64)) IS NOT NULL THEN RAISE EXCEPTION 'the login token read with the wrong state'; END IF;
  UPDATE public.brand_connect_pending SET expires_at = now() - interval '1 minute' WHERE id = _pending;
  IF public.brand_connect_pending_token(_pending, repeat('a', 64)) IS NOT NULL THEN RAISE EXCEPTION 'an expired login token read back'; END IF;
  PERFORM public.clear_brand_connect_expired();
  SELECT count(*) INTO _n FROM public.brand_connect_pending WHERE id = _pending;
  IF _n <> 0 THEN RAISE EXCEPTION 'an expired login was not cleared'; END IF;
  SELECT count(*) INTO _n FROM vault.secrets;
  IF _n <> _vault_before THEN RAISE EXCEPTION 'clearing a login left its vault row'; END IF;

  -- 7. Links: staff make and cancel; a brand user can't; a visitor sees only status and names.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _admin, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.brand_connect_links (client_id) VALUES (_client_a) RETURNING id, token INTO _link, _token;
  BEGIN
    INSERT INTO public.brand_connect_links (client_id) VALUES (_client_b);
    RAISE EXCEPTION 'an agency admin made a link for another agency''s brand';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  IF length(_token) <> 32 THEN RAISE EXCEPTION 'a link token is % characters', length(_token); END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _portal, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.brand_connect_links WHERE id = _link;
  IF _n <> 0 THEN RAISE EXCEPTION 'a portal user can see a connect link'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  _j := public.get_brand_connect_link(_token);
  IF _j->>'status' <> 'open' OR _j->>'brand_name' <> 'Verify A' OR _j ? 'client_id' OR _j ? 'token' THEN RAISE EXCEPTION 'wrong link answer: %', _j; END IF;
  IF public.get_brand_connect_link('made-up') IS NOT NULL THEN RAISE EXCEPTION 'a made-up link got an answer'; END IF;
  RESET ROLE;
  UPDATE public.brand_connect_links SET expires_at = now() - interval '1 minute' WHERE id = _link;
  IF public.get_brand_connect_link(_token)->>'status' <> 'expired' THEN RAISE EXCEPTION 'an expired link did not say so'; END IF;
  UPDATE public.brand_connect_links SET revoked_at = now() WHERE id = _link;
  IF public.get_brand_connect_link(_token)->>'status' <> 'cancelled' THEN RAISE EXCEPTION 'a cancelled link did not say so'; END IF;
END
