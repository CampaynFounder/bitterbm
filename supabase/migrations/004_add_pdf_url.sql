-- Add pdf_url for CourtListener PDF storage (Supabase Storage or external)
alter table raw_cases add column if not exists pdf_url text;

comment on column raw_cases.pdf_url is 'URL to PDF of opinion (Supabase Storage or CourtListener)';
