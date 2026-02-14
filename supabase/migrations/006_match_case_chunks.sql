-- RPC function for vector similarity search with optional state filter
-- Call via: supabase.rpc('match_case_chunks', {'query_embedding': [...], 'match_count': 5, 'filter_state': 'GA'})

create or replace function match_case_chunks(
  query_embedding vector(1536),
  match_count int default 5,
  filter_state text default null
)
returns table (
  id uuid,
  cluster_id text,
  case_name text,
  county text,
  judge text,
  date_filed date,
  chunk_text text,
  chunk_index int,
  state text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    cc.id,
    cc.cluster_id,
    cc.case_name,
    cc.county,
    cc.judge,
    cc.date_filed,
    cc.chunk_text,
    cc.chunk_index,
    cc.state,
    cc.metadata,
    1 - (cc.embedding <=> query_embedding) as similarity
  from case_chunks cc
  where cc.embedding is not null
    and cc.chunk_text is not null
    and (filter_state is null or cc.state = filter_state)
  order by cc.embedding <=> query_embedding
  limit match_count;
end;
$$;

comment on function match_case_chunks is 'Vector similarity search on case_chunks with optional state filter for RAG retrieval';
