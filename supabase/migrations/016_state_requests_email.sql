-- Add email to state_requests for notification when state goes live
alter table state_requests add column if not exists email text;

-- Backfill existing rows from auth.users
update state_requests sr
set email = u.email
from auth.users u
where sr.user_id = u.id and (sr.email is null or sr.email = '');
