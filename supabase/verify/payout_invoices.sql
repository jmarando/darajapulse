-- Checks for 20261102100000_payout_invoices.sql (Stage 2 of the creator payouts plan).
-- Paste inside the dry-run DO block, after EXECUTE of the migration text and before the final
-- RAISE EXCEPTION 'ROLLED_BACK: all checks passed'. Needs 20261031100000_creator_payout_details.sql to have run
-- first (or a stand-in with the same columns). Every scratch row rolls back with the block.
-- The storage DELETE policy shares the expression of the SELECT and INSERT policies and is not run here: Supabase
-- storage refuses direct deletes from SQL.
DECLARE
  _agency_a uuid := gen_random_uuid();
  _agency_b uuid := gen_random_uuid();
  _staff_a uuid := gen_random_uuid();
  _staff_b uuid := gen_random_uuid();
  _client uuid := gen_random_uuid();
  _campaign uuid := gen_random_uuid();
  _inf1 uuid := gen_random_uuid(); -- has details and a payout (invoice raised)
  _inf2 uuid := gen_random_uuid(); -- has neither
  _inf3 uuid := gen_random_uuid(); -- payout with a declined invoice
  _inf4 uuid := gen_random_uuid(); -- payout with an approved invoice
  _ci1 uuid := gen_random_uuid();
  _ci2 uuid := gen_random_uuid();
  _ci3 uuid := gen_random_uuid();
  _ci4 uuid := gen_random_uuid();
  _tok1 text := 'verify-invoice-1-' || gen_random_uuid();
  _tok2 text := 'verify-invoice-2-' || gen_random_uuid();
  _p_raised uuid := gen_random_uuid();
  _p_declined uuid := gen_random_uuid();
  _p_approved uuid := gen_random_uuid();
  _res jsonb;
  _ok boolean;
  _n int;
  _row record;
  _bucket record;
BEGIN
  -- Scratch agencies, staff, campaign (45 days' terms), creators and three payouts in different invoice states.
  INSERT INTO auth.users (id, email) VALUES
    (_staff_a, 'verify-invoice-a@example.invalid'), (_staff_b, 'verify-invoice-b@example.invalid');
  INSERT INTO public.agencies (id, name, slug) VALUES
    (_agency_a, 'Verify invoices A', 'verify-invoices-a-' || left(_agency_a::text, 8)),
    (_agency_b, 'Verify invoices B', 'verify-invoices-b-' || left(_agency_b::text, 8));
  INSERT INTO public.user_roles (user_id, role, agency_id) VALUES
    (_staff_a, 'agency_admin', _agency_a), (_staff_b, 'agency_admin', _agency_b);
  INSERT INTO public.clients (id, name, agency_id) VALUES (_client, 'Verify client', _agency_a);
  INSERT INTO public.campaigns (id, client_id, name, agency_id, payment_terms_days) VALUES (_campaign, _client, 'Verify invoices campaign', _agency_a, 45);
  INSERT INTO public.influencers (id, full_name, agency_id) VALUES
    (_inf1, 'Jane Kamau', _agency_a), (_inf2, 'John Otieno', _agency_a), (_inf3, 'Mary Achieng', _agency_a), (_inf4, 'Peter Njoroge', _agency_a);
  INSERT INTO public.campaign_influencers (id, campaign_id, influencer_id, brief_token) VALUES
    (_ci1, _campaign, _inf1, _tok1), (_ci2, _campaign, _inf2, _tok2), (_ci3, _campaign, _inf3, 'verify-invoice-3-' || gen_random_uuid()),
    (_ci4, _campaign, _inf4, 'verify-invoice-4-' || gen_random_uuid());
  INSERT INTO public.creator_payout_details (agency_id, influencer_id, mpesa_number, mpesa_name, kra_pin, legal_name, id_number, vat_registered, bii_consent_at, confirmed_at)
    VALUES (_agency_a, _inf1, '254712345678', 'Jane W Kamau', 'A123456789Z', 'Jane Wanjiku Kamau', '12345678', false, now(), now());
  INSERT INTO public.payouts (id, campaign_id, influencer_id, gross_kes, wht_kes, net_kes, invoice_route, invoice_status, invoice_raised_at, invoice_decided_at, invoice_number) VALUES
    (_p_raised, _campaign, _inf1, 5000, 250, 4750, 'bii', 'raised', now(), NULL, NULL),
    (_p_declined, _campaign, _inf3, 5000, 250, 4750, 'bii', 'declined', now(), now(), NULL),
    (_p_approved, _campaign, _inf4, 5000, 250, 4750, 'bii', 'approved', now(), now(), 'ETIMS-1');

  -- 1. Payouts that already existed were backfilled with their finalise date.
  SELECT count(*) INTO _n FROM public.payouts
  WHERE id NOT IN (_p_raised, _p_declined, _p_approved) AND report_approved_at IS DISTINCT FROM created_at;
  IF _n <> 0 THEN RAISE EXCEPTION '% existing payouts were not backfilled with their finalise date', _n; END IF;

  -- 2. A new payout starts with today's date as its report approval date.
  SELECT * INTO _row FROM public.payouts WHERE id = _p_raised;
  IF _row.report_approved_at IS NULL OR abs(extract(epoch FROM (now() - _row.report_approved_at))) > 5 THEN
    RAISE EXCEPTION 'a new payout has report_approved_at %', _row.report_approved_at;
  END IF;

  -- 3. While an invoice is raised or approved the amount and the route are locked; after a decline they are not.
  _ok := false;
  BEGIN UPDATE public.payouts SET net_kes = 4751 WHERE id = _p_raised; EXCEPTION WHEN raise_exception THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'net_kes changed on a raised invoice'; END IF;
  _ok := false;
  BEGIN UPDATE public.payouts SET gross_kes = 5001 WHERE id = _p_raised; EXCEPTION WHEN raise_exception THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'gross_kes changed on a raised invoice'; END IF;
  _ok := false;
  BEGIN UPDATE public.payouts SET wht_kes = 251 WHERE id = _p_approved; EXCEPTION WHEN raise_exception THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'wht_kes changed on an approved invoice'; END IF;
  _ok := false;
  BEGIN UPDATE public.payouts SET invoice_route = 'creator' WHERE id = _p_approved; EXCEPTION WHEN raise_exception THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'invoice_route changed on an approved invoice'; END IF;
  UPDATE public.payouts SET gross_kes = 5001, wht_kes = 250, net_kes = 4751 WHERE id = _p_declined;
  UPDATE public.payouts SET invoice_status = 'approved', invoice_number = 'ETIMS-2', invoice_decided_at = now() WHERE id = _p_raised;

  -- 4. The table keeps route and status consistent.
  _ok := false;
  BEGIN UPDATE public.payouts SET invoice_status = 'approved' WHERE id = _p_declined; EXCEPTION WHEN check_violation THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'approved without an invoice number was accepted'; END IF;
  _ok := false;
  BEGIN UPDATE public.payouts SET invoice_status = 'not_raised' WHERE id = _p_declined; EXCEPTION WHEN check_violation THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'not_raised with a route was accepted'; END IF;
  _ok := false;
  BEGIN UPDATE public.payouts SET invoice_status = 'raised', invoice_raised_at = NULL WHERE id = _p_declined; EXCEPTION WHEN check_violation THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'raised without a raised date was accepted'; END IF;
  _ok := false;
  BEGIN UPDATE public.payouts SET invoice_decided_at = NULL WHERE id = _p_declined; EXCEPTION WHEN check_violation THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'declined without a decided date was accepted'; END IF;
  _ok := false;
  BEGIN UPDATE public.payouts SET invoice_route = 'fax' WHERE id = _p_declined; EXCEPTION WHEN check_violation THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'invoice_route fax was accepted'; END IF;

  -- 5. A declined invoice can be raised again, by the other route.
  UPDATE public.payouts
  SET invoice_route = 'creator', invoice_status = 'raised', invoice_raised_at = now(), invoice_decided_at = NULL
  WHERE id = _p_declined;

  -- 6. Payment terms run from 0 to 365 days, or are not set.
  UPDATE public.campaigns SET payment_terms_days = 0 WHERE id = _campaign;
  UPDATE public.campaigns SET payment_terms_days = NULL WHERE id = _campaign;
  _ok := false;
  BEGIN UPDATE public.campaigns SET payment_terms_days = 366 WHERE id = _campaign; EXCEPTION WHEN check_violation THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'payment_terms_days 366 was accepted'; END IF;
  UPDATE public.campaigns SET payment_terms_days = 45 WHERE id = _campaign;

  -- 7. The invoice bucket is private, limited in size and to PDF and images.
  SELECT public, file_size_limit, allowed_mime_types INTO _bucket FROM storage.buckets WHERE id = 'payout-invoices';
  IF NOT FOUND THEN RAISE EXCEPTION 'bucket payout-invoices does not exist'; END IF;
  IF _bucket.public IS DISTINCT FROM false OR _bucket.file_size_limit IS DISTINCT FROM 10485760
     OR NOT ('application/pdf' = ANY (_bucket.allowed_mime_types)) THEN
    RAISE EXCEPTION 'bucket settings are wrong: %', row_to_json(_bucket);
  END IF;

  -- 8. Invoice files belong to the agency named in the first folder of the path.
  IF public.payout_invoice_agency('not-a-uuid/x.pdf') IS NOT NULL OR public.payout_invoice_agency('') IS NOT NULL THEN
    RAISE EXCEPTION 'a path without an agency uuid gave an agency';
  END IF;
  IF public.payout_invoice_agency(_agency_a::text || '/p/f.pdf') IS DISTINCT FROM _agency_a THEN
    RAISE EXCEPTION 'the agency was not read from the path';
  END IF;
  INSERT INTO storage.objects (bucket_id, name) VALUES ('payout-invoices', _agency_a::text || '/' || _p_raised::text || '/invoice.pdf');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', _staff_a, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM storage.objects WHERE bucket_id = 'payout-invoices';
  RESET ROLE;
  IF _n <> 1 THEN RAISE EXCEPTION 'staff of the agency see % invoice files, expected 1', _n; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', _staff_b, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM storage.objects WHERE bucket_id = 'payout-invoices';
  _ok := false;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('payout-invoices', _agency_a::text || '/' || _p_raised::text || '/other.pdf');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF _n <> 0 THEN RAISE EXCEPTION 'another agency sees % invoice files', _n; END IF;
  IF NOT _ok THEN RAISE EXCEPTION 'another agency added a file to this agency''s folder'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', _staff_a, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO storage.objects (bucket_id, name) VALUES ('payout-invoices', _agency_a::text || '/' || _p_raised::text || '/second.pdf');
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO _n FROM storage.objects WHERE bucket_id = 'payout-invoices';
  EXCEPTION WHEN insufficient_privilege THEN _n := 0;
  END;
  RESET ROLE;
  IF _n <> 0 THEN RAISE EXCEPTION 'the public role sees % invoice files', _n; END IF;

  -- 9. Agency staff can write invoice fields on their own payouts; another agency cannot touch them.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _staff_a, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.payouts SET invoice_number = 'ETIMS-3' WHERE id = _p_approved;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RESET ROLE;
  IF _n <> 1 THEN RAISE EXCEPTION 'agency staff updated % payouts', _n; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _staff_b, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.payouts SET invoice_number = 'ETIMS-4' WHERE id = _p_approved;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RESET ROLE;
  IF _n <> 0 THEN RAISE EXCEPTION 'another agency updated % payouts', _n; END IF;

  -- 10. The creator's card: payout and invoice state, masked details, nothing raw.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  _res := public.get_payout_card_by_token(_tok1);
  RESET ROLE;
  IF _res->'payout'->>'invoice_status' IS DISTINCT FROM 'approved'
     OR _res->'payout'->>'invoice_route' IS DISTINCT FROM 'bii'
     OR _res->'payout'->>'status' IS DISTINCT FROM 'pending'
     OR (_res->'payout'->>'gross_kes')::numeric IS DISTINCT FROM 5000
     OR (_res->'payout'->>'net_kes')::numeric IS DISTINCT FROM 4750
     OR (_res->'payout'->>'payment_terms_days')::int IS DISTINCT FROM 45
     OR _res->'payout'->>'invoice_raised_at' IS NULL
     OR _res->'payout'->>'invoice_decided_at' IS NULL
     OR _res->'payout'->>'report_approved_at' IS NULL THEN
    RAISE EXCEPTION 'payout block is wrong: %', _res->'payout';
  END IF;
  IF _res->'details'->>'mpesa_number_masked' IS DISTINCT FROM '07••• ••• 678'
     OR _res->'details'->>'kra_pin_masked' IS DISTINCT FROM 'A••••••789Z'
     OR _res->'details'->>'id_number_masked' IS DISTINCT FROM '••••5678' THEN
    RAISE EXCEPTION 'details masks changed: %', _res->'details';
  END IF;
  IF _res::text LIKE '%A123456789Z%' OR _res::text LIKE '%12345678%' THEN RAISE EXCEPTION 'card shows the full PIN or ID: %', _res; END IF;
  _res := public.get_payout_card_by_token(_tok2);
  IF jsonb_typeof(_res->'payout') IS DISTINCT FROM 'null' OR jsonb_typeof(_res->'details') IS DISTINCT FROM 'null' THEN
    RAISE EXCEPTION 'a creator with no payout and no details got %', _res;
  END IF;
  IF public.get_payout_card_by_token('no-such-token') IS NOT NULL THEN RAISE EXCEPTION 'card for an unknown token is not null'; END IF;
END;
