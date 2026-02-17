-- Extensible scraper: state, county, attorneys, GAL; link documents to cases
-- Supports PDF/text/transcript extraction with full metadata linking

-- Add metadata columns to scraped_cases
alter table scraped_cases
  add column if not exists state text,
  add column if not exists county text,
  add column if not exists attorneys text[],
  add column if not exists gal text;

create index if not exists scraped_cases_state on scraped_cases(state);
create index if not exists scraped_cases_county on scraped_cases(county);

-- Documents linked to cases (PDFs, transcripts, text)
-- Allows multiple documents per case with doc_type
create table if not exists scraped_documents (
  id uuid primary key default gen_random_uuid(),
  scraped_case_id uuid references scraped_cases(id) on delete cascade,
  doc_type text,  -- 'pdf', 'transcript', 'order', 'complaint', etc.
  url text,
  text_content text,
  file_path text,  -- if stored locally
  created_at timestamptz default now()
);

create index if not exists scraped_documents_case on scraped_documents(scraped_case_id);
create index if not exists scraped_documents_type on scraped_documents(doc_type);

comment on table scraped_documents is 'PDF, text, or transcript documents extracted per case';
comment on column scraped_cases.state is 'State (e.g. NC, CA)';
comment on column scraped_cases.county is 'County';
comment on column scraped_cases.attorneys is 'Array of attorney names';
comment on column scraped_cases.gal is 'Guardian ad litem';
