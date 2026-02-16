-- Allow anonymous state requests (email + state, no sign-in)
alter table state_requests alter column user_id drop not null;

-- Drop existing unique; add partial uniques
alter table state_requests drop constraint if exists state_requests_user_id_state_code_key;

create unique index if not exists state_requests_user_state_unique
  on state_requests(user_id, state_code) where user_id is not null;

create unique index if not exists state_requests_anon_email_state_unique
  on state_requests(lower(email), state_code) where user_id is null;

-- Allow anonymous insert (email + state_code required when user_id is null)
create policy "Anonymous insert state requests" on state_requests for insert to anon
  with check (user_id is null and email is not null and email != '');
