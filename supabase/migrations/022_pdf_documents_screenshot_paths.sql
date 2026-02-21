-- Allow multiple screenshots per PDF (e.g. one per page)
-- screenshot_path remains for backward compat (first screenshot)
alter table public.pdf_documents add column if not exists screenshot_paths text[] default '{}';
comment on column public.pdf_documents.screenshot_paths is 'Storage paths for per-page screenshots in scraped-screenshots bucket';
