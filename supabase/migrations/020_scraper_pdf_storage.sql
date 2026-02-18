-- Scraper: PDF documents table and storage buckets for RAG
-- One row per PDF; state/county stored per document for jurisdiction filtering
-- Supports simple flows (filter → extract → download) and complex nested flows

-- pdf_documents: one row per PDF for RAG retrieval (state, county filterable)
create table if not exists pdf_documents (
  id uuid primary key default gen_random_uuid(),
  job_id uuid,
  flow_id uuid references scraper_flows(id) on delete set null,
  source_site text,
  source_url text,
  pdf_url text,           -- original URL before download
  pdf_storage_path text,  -- path in scraped-pdfs bucket
  screenshot_path text,   -- optional screenshot in scraped-screenshots bucket
  state text,
  county text,
  case_number text,
  case_name text,
  court text,
  judge text,
  attorney text,
  attorneys text[],
  gal text,
  doc_type text,          -- 'order', 'complaint', 'transcript', etc.
  text_content text,      -- extracted text for embedding
  raw_metadata jsonb default '{}',
  scraped_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists pdf_documents_state on pdf_documents(state);
create index if not exists pdf_documents_county on pdf_documents(county);
create index if not exists pdf_documents_flow_id on pdf_documents(flow_id);
create index if not exists pdf_documents_job_id on pdf_documents(job_id);
create index if not exists pdf_documents_source_site on pdf_documents(source_site);

comment on table pdf_documents is 'One row per scraped PDF for RAG; state/county for jurisdiction filtering';

-- Storage buckets for scraped PDFs and screenshots
-- scraped-pdfs: downloaded PDFs (public read for embedding/RAG)
insert into storage.buckets (id, name, public)
values ('scraped-pdfs', 'scraped-pdfs', true)
on conflict (id) do update set public = true;

-- scraped-screenshots: page/PDF screenshots (optional, public read)
insert into storage.buckets (id, name, public)
values ('scraped-screenshots', 'scraped-screenshots', true)
on conflict (id) do update set public = true;

-- RLS: Service role (Modal/API) bypasses RLS. This policy allows anon/authenticated read for RAG.
alter table pdf_documents enable row level security;

create policy "Allow read pdf_documents for RAG"
  on pdf_documents for select
  using (true);
