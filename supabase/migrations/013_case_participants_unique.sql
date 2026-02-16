-- Unique constraint for case_participants to support upsert (extract_judges idempotency)
create unique index if not exists case_participants_raw_type_participant
  on case_participants(raw_case_id, participant_type, participant_id);
