-- Legal Intelligence: judges, attorneys, experts, case participants, and RAG embedding tables
-- Extends raw_cases/case_chunks with entity profiles and specialized RAG collections

-- Judges (extracted from opinions, enriched from court/admin data)
create table if not exists judges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  court text,
  state text,
  county text,
  appointed_date date,
  appointing_authority text,
  background_summary text,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists judges_name on judges(name);
create index if not exists judges_state_county on judges(state, county);

-- Attorneys (from case records, bar directories)
create table if not exists attorneys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  bar_number text,
  state text,
  practice_areas text[],
  firm text,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists attorneys_name on attorneys(name);
create index if not exists attorneys_state on attorneys(state);

-- Experts (GALs, psychologists, custody evaluators)
create table if not exists experts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  expert_type text, -- 'GAL', 'psychologist', 'custody_evaluator'
  credentials text[],
  state text,
  county text,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists experts_name on experts(name);
create index if not exists experts_state_county on experts(state, county);
create index if not exists experts_type on experts(expert_type);

-- Case participants: links raw_cases to judges, attorneys, experts
create table if not exists case_participants (
  id uuid primary key default gen_random_uuid(),
  raw_case_id uuid not null references raw_cases(id) on delete cascade,
  participant_type text not null, -- 'judge', 'attorney', 'expert'
  participant_id uuid not null, -- references judges(id), attorneys(id), or experts(id)
  role text, -- 'plaintiff_counsel', 'defendant_counsel', 'GAL', 'custody_evaluator'
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists case_participants_raw_case on case_participants(raw_case_id);
create index if not exists case_participants_participant on case_participants(participant_type, participant_id);

-- Judge analysis embeddings (RAG for judicial tendencies)
create table if not exists judge_analysis_embeddings (
  id uuid primary key default gen_random_uuid(),
  judge_id uuid references judges(id) on delete cascade,
  source_type text, -- 'opinion', 'ruling', 'transcript'
  chunk_text text not null,
  embedding vector(1536),
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists judge_analysis_embeddings_judge on judge_analysis_embeddings(judge_id);
create index if not exists judge_analysis_embeddings_vector on judge_analysis_embeddings
  using ivfflat (embedding vector_cosine_ops);

-- Expert profile embeddings (RAG for GAL/psychologist profiles)
create table if not exists expert_profile_embeddings (
  id uuid primary key default gen_random_uuid(),
  expert_id uuid references experts(id) on delete cascade,
  source_type text, -- 'testimony', 'report', 'publication'
  chunk_text text not null,
  embedding vector(1536),
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists expert_profile_embeddings_expert on expert_profile_embeddings(expert_id);
create index if not exists expert_profile_embeddings_vector on expert_profile_embeddings
  using ivfflat (embedding vector_cosine_ops);

-- Attorney intelligence embeddings (RAG for attorney patterns)
create table if not exists attorney_intelligence_embeddings (
  id uuid primary key default gen_random_uuid(),
  attorney_id uuid references attorneys(id) on delete cascade,
  source_type text, -- 'brief', 'motion', 'pleading'
  chunk_text text not null,
  embedding vector(1536),
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists attorney_intelligence_embeddings_attorney on attorney_intelligence_embeddings(attorney_id);
create index if not exists attorney_intelligence_embeddings_vector on attorney_intelligence_embeddings
  using ivfflat (embedding vector_cosine_ops);

-- Filing embeddings (user-uploaded opposing counsel filings)
-- Links to user's case via case_id (008 cases table)
create table if not exists filing_embeddings (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id) on delete cascade,
  filing_type text,
  filing_date date,
  chunk_text text not null,
  embedding vector(1536),
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists filing_embeddings_case on filing_embeddings(case_id);
create index if not exists filing_embeddings_vector on filing_embeddings
  using ivfflat (embedding vector_cosine_ops);

-- RLS: same as pipeline tables - authenticated read
alter table judges enable row level security;
alter table attorneys enable row level security;
alter table experts enable row level security;
alter table case_participants enable row level security;
alter table judge_analysis_embeddings enable row level security;
alter table expert_profile_embeddings enable row level security;
alter table attorney_intelligence_embeddings enable row level security;
alter table filing_embeddings enable row level security;

create policy "Authenticated read judges" on judges for select to authenticated using (true);
create policy "Authenticated read attorneys" on attorneys for select to authenticated using (true);
create policy "Authenticated read experts" on experts for select to authenticated using (true);
create policy "Authenticated read case_participants" on case_participants for select to authenticated using (true);
create policy "Authenticated read judge_analysis_embeddings" on judge_analysis_embeddings for select to authenticated using (true);
create policy "Authenticated read expert_profile_embeddings" on expert_profile_embeddings for select to authenticated using (true);
create policy "Authenticated read attorney_intelligence_embeddings" on attorney_intelligence_embeddings for select to authenticated using (true);

-- filing_embeddings: users read own (via case ownership)
create policy "Users read own filing_embeddings" on filing_embeddings for select to authenticated
  using (exists (select 1 from cases c where c.id = case_id and c.user_id = auth.uid()));
create policy "Users insert own filing_embeddings" on filing_embeddings for insert to authenticated
  with check (exists (select 1 from cases c where c.id = case_id and c.user_id = auth.uid()));
