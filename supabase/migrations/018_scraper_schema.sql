-- Scraper: flows + scraped case data for training
-- Supports court, judge, case type, status filters; table/list traversal; PDF/text extraction

create table if not exists scraper_flows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  flow_json jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists scraper_flows_name on scraper_flows(name);

-- Scraped cases: flexible schema for training (raw from any court site)
create table if not exists scraped_cases (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid references scraper_flows(id) on delete set null,
  source_url text,
  source_site text,
  case_number text,
  case_name text,
  court text,
  judge text,
  attorney text,
  case_type text,
  case_status text,
  date_filed date,
  raw_data jsonb default '{}',
  pdf_urls text[] default '{}',
  text_content text,
  scraped_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists scraped_cases_flow_id on scraped_cases(flow_id);
create index if not exists scraped_cases_source_site on scraped_cases(source_site);
create index if not exists scraped_cases_case_number on scraped_cases(case_number);
create index if not exists scraped_cases_date_filed on scraped_cases(date_filed);

-- Scraper jobs: execution log
create table if not exists scraper_jobs (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid references scraper_flows(id) on delete set null,
  status text not null default 'pending',
  vars jsonb default '{}',
  rows_scraped int default 0,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists scraper_jobs_flow_id on scraper_jobs(flow_id);
create index if not exists scraper_jobs_status on scraper_jobs(status);
