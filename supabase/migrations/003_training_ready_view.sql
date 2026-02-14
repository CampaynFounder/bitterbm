-- View of raw_cases suitable for RAG training: has plain_text, state, county
-- Chunk/embed step should query this view
create or replace view training_ready_cases as
select
  id,
  cluster_id,
  case_name,
  case_name_full,
  court,
  court_id,
  state,
  county,
  judge,
  date_filed,
  docket_number,
  citation,
  source,
  plain_text,
  pdf_url,
  metadata,
  created_at
from raw_cases
where
  plain_text is not null
  and length(trim(plain_text)) >= 200
  and state is not null
  and state != ''
  and county is not null
  and county != '';

comment on view training_ready_cases is
  'Cases with usable plain_text (>=200 chars), state, and county for RAG training';
