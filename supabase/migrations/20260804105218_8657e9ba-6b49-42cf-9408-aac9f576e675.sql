CREATE POLICY "Authenticated read story proofs" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'story-proofs');
CREATE POLICY "Authenticated upload story proofs" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'story-proofs');
CREATE POLICY "Authenticated update story proofs" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'story-proofs');
CREATE POLICY "Authenticated delete story proofs" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'story-proofs');