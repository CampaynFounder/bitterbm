-- Add state to case_chunks for per-state RAG filtering (Option B)
-- Enables: WHERE state = 'GA' at query time; single RAG grows with all states

alter table case_chunks add column if not exists state text default 'GA';
create index if not exists case_chunks_state on case_chunks(state);

-- Vector index for similarity search (if not already present)
-- ivfflat: good for moderate datasets; lists ~ sqrt(row_count) recommended
create index if not exists case_chunks_embedding_idx
  on case_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

comment on column case_chunks.state is 'State code (GA, NC, etc.) for filtering RAG queries by jurisdiction';
