-- User-submitted attorney analyses with party (user vs alienating parent)
create table if not exists user_attorney_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid references cases(id) on delete set null,
  attorney_name text not null,
  state text not null,
  party text not null check (party in ('user_attorney', 'alienating_parent_attorney')),
  analysis_summary text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists user_attorney_analyses_user_id on user_attorney_analyses(user_id);
create index if not exists user_attorney_analyses_case_id on user_attorney_analyses(case_id);

alter table user_attorney_analyses enable row level security;

create policy "Users manage own attorney analyses" on user_attorney_analyses for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
