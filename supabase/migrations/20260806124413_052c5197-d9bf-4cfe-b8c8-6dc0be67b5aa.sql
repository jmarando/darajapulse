
CREATE POLICY "Anyone with a link can upload a creator draft"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id = 'creator-drafts');

CREATE POLICY "Signed-in users can read creator drafts"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'creator-drafts');
