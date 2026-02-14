-- Pipeline tables for CourtListener → Storage → RAG flow
-- Run in Supabase SQL Editor or via supabase db push

-- Raw cases from CourtListener (before chunking)
-- GA-focused: all alienation cases from GA appellate courts (gact, gactapp)
create table if not exists raw_cases (
  id uuid primary key default gen_random_uuid(),
  cluster_id text not null,
  case_name text,
  case_name_full text,
  court text,
  court_id text,
  state text default 'GA',
  county text default 'Georgia',
  judge text,
  date_filed date,
  docket_number text,
  citation jsonb,
  source text default 'courtlistener',
  plain_text text,
  metadata jsonb,
  created_at timestamptz default now(),
  unique(cluster_id, source)
);

create index if not exists raw_cases_cluster_id on raw_cases(cluster_id);
create index if not exists raw_cases_state on raw_cases(state);
create index if not exists raw_cases_county on raw_cases(county);
create index if not exists raw_cases_date_filed on raw_cases(date_filed);

-- Pipeline run log (fetch, chunk, embed steps)
create table if not exists pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  step text not null, -- 'fetch' | 'chunk' | 'embed' | 'complete'
  status text not null default 'ok', -- 'ok' | 'error'
  message text,
  counts jsonb, -- { "fetched": 20, "stored": 20, "skipped": 0 }
  filters jsonb, -- { "query": "alienation", "courts": ["gact", "gactapp"] }
  error_detail text,
  created_at timestamptz default now()
);

create index if not exists pipeline_runs_step on pipeline_runs(step);
create index if not exists pipeline_runs_created_at on pipeline_runs(created_at desc);

-- RAG chunks (embeddings + metadata) - for later
create extension if not exists vector;

create table if not exists case_chunks (
  id uuid primary key default gen_random_uuid(),
  cluster_id text,
  case_name text,
  county text,
  judge text,
  date_filed date,
  chunk_text text not null,
  chunk_index int default 0,
  embedding vector(1536), -- OpenAI text-embedding-3-small
  metadata jsonb,
  created_at timestamptz default now()
);

create index if not exists case_chunks_cluster on case_chunks(cluster_id);
create index if not exists case_chunks_county on case_chunks(county);
create index if not exists case_chunks_date on case_chunks(date_filed);

-- RLS: require auth to read (dashboard is protected)
alter table raw_cases enable row level security;
alter table pipeline_runs enable row level security;
alter table case_chunks enable row level security;

create policy "Authenticated users can read raw_cases"
  on raw_cases for select to authenticated using (true);

create policy "Authenticated users can read pipeline_runs"
  on pipeline_runs for select to authenticated using (true);

create policy "Authenticated users can read case_chunks"
  on case_chunks for select to authenticated using (true);

-- Modal uses service_role key which bypasses RLS
