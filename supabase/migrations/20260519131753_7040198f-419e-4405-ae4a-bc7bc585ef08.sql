
ALTER TABLE public.brief_templates
  ADD COLUMN IF NOT EXISTS source_file_url text,
  ADD COLUMN IF NOT EXISTS source_file_name text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('brief-docs', 'brief-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Agency staff manage all brief docs
CREATE POLICY "Agency reads brief-docs"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'brief-docs'
  AND (public.has_role(auth.uid(), 'agency_admin') OR public.has_role(auth.uid(), 'account_manager'))
);

CREATE POLICY "Agency uploads brief-docs"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'brief-docs'
  AND (public.has_role(auth.uid(), 'agency_admin') OR public.has_role(auth.uid(), 'account_manager'))
);

CREATE POLICY "Agency updates brief-docs"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'brief-docs'
  AND (public.has_role(auth.uid(), 'agency_admin') OR public.has_role(auth.uid(), 'account_manager'))
);

CREATE POLICY "Agency deletes brief-docs"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'brief-docs'
  AND (public.has_role(auth.uid(), 'agency_admin') OR public.has_role(auth.uid(), 'account_manager'))
);
