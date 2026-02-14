-- Add state and plain_text to raw_cases (for existing deployments)
-- Run if raw_cases already exists from 001

alter table raw_cases add column if not exists state text default 'GA';
alter table raw_cases add column if not exists plain_text text;
create index if not exists raw_cases_state on raw_cases(state);
