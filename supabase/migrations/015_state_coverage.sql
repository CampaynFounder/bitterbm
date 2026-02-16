-- State coverage: supported states + user requests for prioritization
-- supported_states: app_config key, JSON array of state codes we've analyzed
-- state_requests: one row per user request; count per state drives prioritization

insert into app_config (key, value) values
  ('supported_states', '["GA"]'::jsonb)
on conflict (key) do nothing;

create table if not exists state_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  state_code text not null,
  created_at timestamptz default now(),
  unique(user_id, state_code)
);

create index if not exists state_requests_state_code on state_requests(state_code);
create index if not exists state_requests_user_id on state_requests(user_id);

alter table state_requests enable row level security;

create policy "Users insert own state requests" on state_requests for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users update own state requests" on state_requests for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users read own state requests" on state_requests for select to authenticated
  using (auth.uid() = user_id);

-- Public read for request counts per state (no PII)
create or replace function get_state_request_counts()
returns table (state_code text, request_count bigint) as $$
  select state_code, count(*)::bigint
  from state_requests
  group by state_code
$$ language sql stable security definer;

-- Public read for supported states list
create or replace function get_supported_states()
returns text[] as $$
  select coalesce(
    (select array_agg(x) from app_config ac, jsonb_array_elements_text(ac.value) x where ac.key = 'supported_states'),
    array[]::text[]
  )
$$ language sql stable security definer;

grant execute on function get_state_request_counts() to anon, authenticated;
grant execute on function get_supported_states() to anon, authenticated;
