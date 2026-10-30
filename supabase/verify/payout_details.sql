-- Checks for 20261031100000_creator_payout_details.sql (Stage 1 of the creator payouts plan).
-- Paste inside the dry-run DO block, after EXECUTE of the migration text and before the final
-- RAISE EXCEPTION 'ROLLED_BACK: all checks passed'. Every scratch row rolls back with the block.
DECLARE
  _agency_a uuid := gen_random_uuid();
  _agency_b uuid := gen_random_uuid();
  _staff_a uuid := gen_random_uuid();
  _staff_b uuid := gen_random_uuid();
  _client uuid := gen_random_uuid();
  _campaign uuid := gen_random_uuid();
  _inf1 uuid := gen_random_uuid();
  _inf2 uuid := gen_random_uuid();
  _inf3 uuid := gen_random_uuid();
  _ci1 uuid := gen_random_uuid();
  _ci2 uuid := gen_random_uuid();
  _ci3 uuid := gen_random_uuid();
  _tok1 text := 'verify-payout-1-' || gen_random_uuid();
  _tok2 text := 'verify-payout-2-' || gen_random_uuid();
  _tok3 text := 'verify-payout-3-' || gen_random_uuid();
  _good jsonb := '{"mpesa_number":"254712345678","mpesa_name":"Jane W Kamau","kra_pin":"A123456789Z","legal_name":"Jane Wanjiku Kamau","id_number":"12345678","vat_registered":false,"bii_consent":true}';
  _res jsonb;
  _msg text;
  _ok boolean;
  _n int;
  _row record;
BEGIN
  -- Scratch agencies, staff, campaign and creators. Creator 2 has not signed.
  INSERT INTO auth.users (id, email) VALUES
    (_staff_a, 'verify-payout-a@example.invalid'), (_staff_b, 'verify-payout-b@example.invalid');
  INSERT INTO public.agencies (id, name, slug) VALUES
    (_agency_a, 'Verify payouts A', 'verify-payouts-a-' || left(_agency_a::text, 8)),
    (_agency_b, 'Verify payouts B', 'verify-payouts-b-' || left(_agency_b::text, 8));
  INSERT INTO public.user_roles (user_id, role, agency_id) VALUES
    (_staff_a, 'agency_admin', _agency_a), (_staff_b, 'agency_admin', _agency_b);
  INSERT INTO public.clients (id, name, agency_id) VALUES (_client, 'Verify client', _agency_a);
  INSERT INTO public.campaigns (id, client_id, name, agency_id) VALUES (_campaign, _client, 'Verify payouts campaign', _agency_a);
  INSERT INTO public.influencers (id, full_name, agency_id) VALUES
    (_inf1, 'Jane Kamau', _agency_a), (_inf2, 'John Otieno', _agency_a), (_inf3, 'Mary Achieng', _agency_a);
  INSERT INTO public.campaign_influencers (id, campaign_id, influencer_id, brief_token) VALUES
    (_ci1, _campaign, _inf1, _tok1), (_ci2, _campaign, _inf2, _tok2), (_ci3, _campaign, _inf3, _tok3);
  INSERT INTO public.contract_signatures (campaign_influencer_id, campaign_id, influencer_id, contract_text, contract_hash, signer_name) VALUES
    (_ci1, _campaign, _inf1, 'verify', 'verify', 'Jane Kamau'), (_ci3, _campaign, _inf3, 'verify', 'verify', 'Mary Achieng');

  -- 1. The table refuses a non-Safaricom number, a company PIN and a short ID.
  _ok := false;
  BEGIN
    INSERT INTO public.creator_payout_details (agency_id, influencer_id, mpesa_number, mpesa_name, kra_pin, legal_name, id_number)
    VALUES (_agency_b, _inf2, '254812345678', 'X Y', 'A123456789Z', 'X Y', '12345678');
  EXCEPTION WHEN check_violation THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'mpesa_number 254812345678 was accepted'; END IF;
  _ok := false;
  BEGIN
    INSERT INTO public.creator_payout_details (agency_id, influencer_id, mpesa_number, mpesa_name, kra_pin, legal_name, id_number)
    VALUES (_agency_b, _inf2, '254712345678', 'X Y', 'B123456789Z', 'X Y', '12345678');
  EXCEPTION WHEN check_violation THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'kra_pin B123456789Z was accepted'; END IF;
  _ok := false;
  BEGIN
    INSERT INTO public.creator_payout_details (agency_id, influencer_id, mpesa_number, mpesa_name, kra_pin, legal_name, id_number)
    VALUES (_agency_b, _inf2, '254712345678', 'X Y', 'A123456789Z', 'X Y', '123456');
  EXCEPTION WHEN check_violation THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'id_number 123456 was accepted'; END IF;

  -- 2. A creator saves through their link, twice; one row, recorded as the creator, masked on the way back.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  _res := public.save_payout_details_by_token(_tok1, _good);
  _res := public.save_payout_details_by_token(_tok1, _good);
  RESET ROLE;
  SELECT count(*) INTO _n FROM public.creator_payout_details WHERE agency_id = _agency_a AND influencer_id = _inf1;
  IF _n <> 1 THEN RAISE EXCEPTION 'expected 1 details row after two saves, got %', _n; END IF;
  SELECT * INTO _row FROM public.creator_payout_details WHERE agency_id = _agency_a AND influencer_id = _inf1;
  IF _row.last_changed_by_kind <> 'creator' OR _row.confirmed_at IS NULL OR _row.bii_consent_at IS NULL THEN
    RAISE EXCEPTION 'creator save recorded %', row_to_json(_row);
  END IF;
  IF _res::text LIKE '%A123456789Z%' OR _res::text LIKE '%12345678%' THEN RAISE EXCEPTION 'card shows the full PIN or ID: %', _res; END IF;
  IF _res->'details'->>'mpesa_number_masked' IS DISTINCT FROM '07••• ••• 678'
     OR _res->'details'->>'kra_pin_masked' IS DISTINCT FROM 'A••••••789Z'
     OR _res->'details'->>'id_number_masked' IS DISTINCT FROM '••••5678'
     OR (_res->>'contract_signed')::boolean IS DISTINCT FROM true
     OR (_res->'details'->>'bii_consent')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'card is wrong: %', _res;
  END IF;

  -- 3. Refusals: unsigned agreement, unknown link, missing consent. VAT-registered needs no consent.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  _msg := NULL;
  BEGIN PERFORM public.save_payout_details_by_token(_tok2, _good); EXCEPTION WHEN raise_exception THEN _msg := SQLERRM; END;
  IF _msg IS DISTINCT FROM 'Sign your agreement first' THEN RAISE EXCEPTION 'unsigned link gave %', _msg; END IF;
  _msg := NULL;
  BEGIN PERFORM public.save_payout_details_by_token('no-such-token', _good); EXCEPTION WHEN raise_exception THEN _msg := SQLERRM; END;
  IF _msg IS DISTINCT FROM 'Invalid link' THEN RAISE EXCEPTION 'unknown token gave %', _msg; END IF;
  IF public.get_payout_card_by_token('no-such-token') IS NOT NULL THEN RAISE EXCEPTION 'card for an unknown token is not null'; END IF;
  _msg := NULL;
  BEGIN PERFORM public.save_payout_details_by_token(_tok3, _good || '{"bii_consent":false}'); EXCEPTION WHEN raise_exception THEN _msg := SQLERRM; END;
  IF _msg IS DISTINCT FROM 'Consent is required' THEN RAISE EXCEPTION 'missing consent gave %', _msg; END IF;
  _res := public.save_payout_details_by_token(_tok3, _good || '{"bii_consent":false,"vat_registered":true,"mpesa_number":"254711111111"}');
  RESET ROLE;
  SELECT * INTO _row FROM public.creator_payout_details WHERE agency_id = _agency_a AND influencer_id = _inf3;
  IF NOT FOUND OR _row.bii_consent_at IS NOT NULL OR NOT _row.vat_registered THEN
    RAISE EXCEPTION 'VAT-registered save without consent: %', row_to_json(_row);
  END IF;

  -- 4. An admin of the agency changes the number: recorded as staff, with an event.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _staff_a, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.creator_payout_details SET mpesa_number = '254722000000' WHERE agency_id = _agency_a AND influencer_id = _inf1;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RESET ROLE;
  IF _n <> 1 THEN RAISE EXCEPTION 'agency staff updated % rows', _n; END IF;
  SELECT * INTO _row FROM public.creator_payout_details WHERE agency_id = _agency_a AND influencer_id = _inf1;
  IF _row.last_changed_by_kind <> 'staff' OR _row.last_changed_by IS DISTINCT FROM _staff_a
     OR _row.mpesa_changed_at IS NULL OR _row.mpesa_changed_by_kind IS DISTINCT FROM 'staff' THEN
    RAISE EXCEPTION 'staff change not recorded: %', row_to_json(_row);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.creator_payout_detail_events e
                 WHERE e.details_id = _row.id AND 'mpesa_number' = ANY (e.fields) AND e.changed_by_kind = 'staff') THEN
    RAISE EXCEPTION 'no event for the staff number change';
  END IF;

  -- 5. Staff of another agency see nothing and cannot write.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _staff_b, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM public.creator_payout_details;
  IF _n <> 0 THEN RAISE EXCEPTION 'another agency sees % details rows', _n; END IF;
  SELECT count(*) INTO _n FROM public.creator_payout_detail_events;
  IF _n <> 0 THEN RAISE EXCEPTION 'another agency sees % detail events', _n; END IF;
  _ok := false;
  BEGIN
    INSERT INTO public.creator_payout_details (agency_id, influencer_id, mpesa_number, mpesa_name, kra_pin, legal_name, id_number)
    VALUES (_agency_a, _inf2, '254733000000', 'X Y', 'A123456789Z', 'X Y', '12345678');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'another agency inserted payout details'; END IF;

  -- 6. The public role cannot read the table at all.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  _ok := false;
  BEGIN PERFORM 1 FROM public.creator_payout_details LIMIT 1; EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'anon can select from creator_payout_details'; END IF;
END;
