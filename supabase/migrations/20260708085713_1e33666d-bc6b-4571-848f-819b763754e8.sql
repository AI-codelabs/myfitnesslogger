
CREATE POLICY "Coach reads own nutrition templates"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'nutrition-templates' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Coach uploads own nutrition templates"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'nutrition-templates' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Coach updates own nutrition templates"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'nutrition-templates' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Coach deletes own nutrition templates"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'nutrition-templates' AND auth.uid()::text = (storage.foldername(name))[1]);
