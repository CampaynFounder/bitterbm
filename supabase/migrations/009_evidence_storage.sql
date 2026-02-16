-- Supabase Storage: evidence uploads
-- Bucket is created in 011_create_evidence_bucket.sql (or create manually in Dashboard: Storage > New bucket)

-- RLS: authenticated users can upload/read/delete own files
-- Path format: {user_id}/{case_id}/{file_id}.{ext}
create policy "Users can upload own evidence"
  on storage.objects for insert
  with check (
    bucket_id = 'evidence-uploads'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can read own evidence"
  on storage.objects for select
  using (
    bucket_id = 'evidence-uploads'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update own evidence"
  on storage.objects for update
  using (
    bucket_id = 'evidence-uploads'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own evidence"
  on storage.objects for delete
  using (
    bucket_id = 'evidence-uploads'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
