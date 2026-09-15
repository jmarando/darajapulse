CREATE POLICY "creator drafts overwrite"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'creator-drafts')
WITH CHECK (bucket_id = 'creator-drafts');