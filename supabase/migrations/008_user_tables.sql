-- User-facing tables: profiles, cases, evidence, analysis, subscriptions, payment methods, app config
-- Extends Supabase auth.users (public schema)

-- App config / feature flags (global)
create table if not exists app_config (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz default now()
);

insert into app_config (key, value) values
  ('auth_timing', '"value_first"'::jsonb)
on conflict (key) do nothing;

-- User profiles (one per auth user)
create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  state text,
  county text,
  primary_goal text, -- sole_custody | joint_custody | modification | enforcement | other
  child_age text,
  child_grade text,
  child_sex text,
  child_interests text,
  situation_synopsis text, -- max 500 chars, for system prompt
  retained_attorney_name text,
  onboarding_completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Cases (user's legal matter - one or more per user)
create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state text,
  county text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists cases_user_id on cases(user_id);

-- Evidence (uploads per case)
create table if not exists evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_url text not null,
  file_name text,
  file_type text,
  file_size_bytes int,
  processing_status text default 'pending', -- pending | processing | done | error
  processed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists evidence_case_id on evidence(case_id);
create index if not exists evidence_user_id on evidence(user_id);

-- Analysis results (AI output per case/evidence batch)
create table if not exists analysis_results (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  evidence_ids uuid[] not null default '{}',
  alienation_score int, -- 0-100
  custody_change_likelihood int, -- 0-100
  alienation_tactics text[],
  things_to_prove jsonb, -- [{ label, category }]
  summary text,
  recommended_approach text,
  rag_response text,
  created_at timestamptz default now()
);

create index if not exists analysis_results_case_id on analysis_results(case_id);

-- Subscriptions (plan: free | monthly | flat)
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'free', -- free | monthly | flat
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  status text default 'active', -- active | canceled | past_due | etc
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

create index if not exists subscriptions_user_id on subscriptions(user_id);
create index if not exists subscriptions_stripe_customer on subscriptions(stripe_customer_id);

-- Payment methods (display metadata from Stripe - card last4, brand, etc)
create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_payment_method_id text not null,
  type text, -- card | cashapp | klarna | etc
  last4 text,
  brand text, -- visa | mastercard | amex | etc
  issuer text,
  is_default boolean default true,
  created_at timestamptz default now(),
  unique(user_id, stripe_payment_method_id)
);

create index if not exists payment_methods_user_id on payment_methods(user_id);

-- RLS policies
alter table app_config enable row level security;
alter table user_profiles enable row level security;
alter table cases enable row level security;
alter table evidence enable row level security;
alter table analysis_results enable row level security;
alter table subscriptions enable row level security;
alter table payment_methods enable row level security;

-- app_config: anyone can read (for feature flags)
create policy "Anyone can read app_config"
  on app_config for select using (true);

-- user_profiles: users manage own
create policy "Users can read own profile"
  on user_profiles for select using (auth.uid() = id);
create policy "Users can insert own profile"
  on user_profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile"
  on user_profiles for update using (auth.uid() = id);

-- cases: users manage own
create policy "Users can read own cases"
  on cases for select using (auth.uid() = user_id);
create policy "Users can insert own cases"
  on cases for insert with check (auth.uid() = user_id);
create policy "Users can update own cases"
  on cases for update using (auth.uid() = user_id);
create policy "Users can delete own cases"
  on cases for delete using (auth.uid() = user_id);

-- evidence: users manage own
create policy "Users can read own evidence"
  on evidence for select using (auth.uid() = user_id);
create policy "Users can insert own evidence"
  on evidence for insert with check (auth.uid() = user_id);
create policy "Users can update own evidence"
  on evidence for update using (auth.uid() = user_id);
create policy "Users can delete own evidence"
  on evidence for delete using (auth.uid() = user_id);

-- analysis_results: via case ownership
create policy "Users can read own analysis"
  on analysis_results for select using (
    exists (select 1 from cases c where c.id = case_id and c.user_id = auth.uid())
  );
create policy "Users can insert own analysis"
  on analysis_results for insert with check (
    exists (select 1 from cases c where c.id = case_id and c.user_id = auth.uid())
  );

-- subscriptions: users read own
create policy "Users can read own subscription"
  on subscriptions for select using (auth.uid() = user_id);
create policy "Users can insert own subscription"
  on subscriptions for insert with check (auth.uid() = user_id);
create policy "Users can update own subscription"
  on subscriptions for update using (auth.uid() = user_id);

-- payment_methods: users manage own
create policy "Users can read own payment methods"
  on payment_methods for select using (auth.uid() = user_id);
create policy "Users can insert own payment methods"
  on payment_methods for insert with check (auth.uid() = user_id);
create policy "Users can update own payment methods"
  on payment_methods for update using (auth.uid() = user_id);
create policy "Users can delete own payment methods"
  on payment_methods for delete using (auth.uid() = user_id);
