-- Create evidence-uploads storage bucket (private)
-- Supabase CLI does not support bucket creation; use this migration or create manually in Dashboard.
-- Optional: set file size limit (5MB) and allowed MIME types in Dashboard after creation.
insert into storage.buckets (id, name, public)
values ('evidence-uploads', 'evidence-uploads', false)
on conflict (id) do nothing;
