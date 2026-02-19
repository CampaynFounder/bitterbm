-- Autoscrape: scraped_documents table + workflow_id/run_id on pdf_documents
-- scraped_documents = autoscrape metadata per record; pdf_documents gets workflow_id/run_id for provenance

-- scraped_documents: one row per captured record from autoscrape (case, doc, PDF metadata)
create table if not exists scraped_documents (
  id uuid primary key default gen_random_uuid(),
  workflow_id text not null,
  run_id uuid not null,
  case_id text,
  doc_id text,
  source_url text,
  metadata jsonb default '{}',
  raw_text text,
  pdf_paths text[] default '{}',
  created_at timestamptz default now()
);

-- If table already existed from a previous run without these columns, add them before creating indexes
alter table public.scraped_documents add column if not exists workflow_id text;
alter table public.scraped_documents add column if not exists run_id uuid;

create index if not exists scraped_documents_workflow_id on public.scraped_documents(workflow_id);
create index if not exists scraped_documents_run_id on public.scraped_documents(run_id);
create index if not exists scraped_documents_created_at on public.scraped_documents(created_at);

comment on table scraped_documents is 'Autoscrape metadata per captured record; workflow_id = schema id, run_id = execution id';

-- Add provenance columns to pdf_documents and indexes in one transaction (runner may run each statement separately)
do $$
begin
  alter table public.pdf_documents add column if not exists workflow_id text;
  alter table public.pdf_documents add column if not exists run_id uuid;
  execute 'create index if not exists pdf_documents_workflow_id on public.pdf_documents(workflow_id)';
  execute 'create index if not exists pdf_documents_run_id on public.pdf_documents(run_id)';
end $$;
