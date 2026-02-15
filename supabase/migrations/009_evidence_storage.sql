-- Supabase Storage: evidence uploads
-- Create bucket manually in Dashboard: Storage > New bucket > evidence-uploads (private, 5MB limit, png/jpeg/jpg/pdf)
-- Or: supabase storage create evidence-uploads --private --file-size-limit 5242880

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
