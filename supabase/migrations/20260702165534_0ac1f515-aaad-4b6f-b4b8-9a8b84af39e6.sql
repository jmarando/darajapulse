CREATE OR REPLACE FUNCTION public.set_invoice_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := 'INV-' || to_char(now(),'YYYY') || '-' ||
                          lpad(nextval('public.invoice_number_seq')::text, 4, '0');
  END IF;
  IF NEW.view_token IS NULL THEN
    NEW.view_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  END IF;
  RETURN NEW;
END $$;