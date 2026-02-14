# GA Alienation RAG Storage – Best Practices

Storage strategy for Georgia parental alienation case law from CourtListener, optimized for GA users and future RAG retrieval.

## Data flow

```
CourtListener API (opinions only, appellate courts)
    ↓ q=(alienat*) AND (court_id:gact OR court_id:gactapp)
    ↓ type=o (opinions/case law); alienat* = alienation/alienated/alienating (excludes "alien")
Modal fetch_and_store
    ↓
raw_cases (Supabase) + Modal Volume
    ↓ (future: chunk + embed)
case_chunks (pgvector)
    ↓
RAG retrieval for GA users
```

## Storage best practices

### 1. Idempotency / Deduplication

- **cluster_id** is CourtListener’s case identifier (one case = one cluster, may have multiple opinions).
- **Unique constraint** on `(cluster_id, source)`; upsert uses `on_conflict="cluster_id,source"`.
- Re-running the fetch updates existing rows; no duplicates.

### 2. State / jurisdiction

- `state = 'GA'` on all rows (GA appellate courts only).
- `county` inferred from court name when possible; defaults to `"Georgia"` for statewide courts (gact, gactapp).

### 3. Training-ready filter (plain text required)

- **Only cases with usable plain_text are stored.** Use `fetch_full_text=true`.
- Minimum 200 chars; cases without text or with stub content are skipped.
- State and county are always set (statewide appellate courts use state name for county).
- `training_ready_cases` view: `SELECT * FROM training_ready_cases` for chunk/embed.

### 4. Audit trail

- `pipeline_runs` logs each fetch: step, counts, filters, timestamp.
- Use `filed_after` for incremental runs (e.g. last successful run date).

### 5. Indexes

- `raw_cases`: unique(cluster_id, source), indexes on cluster_id, state, county, date_filed.
- `case_chunks`: cluster_id, county, date_filed + vector index for similarity search.

## GA RAG build (next steps)

1. **Fetch with full text** – Run fetch with `fetch_full_text=true` for cases to be used in RAG.
2. **Chunk** – Split `plain_text` into ~500-token chunks with overlap.
3. **Embed** – OpenAI text-embedding-3-small (1536 dims).
4. **Index** – Insert into `case_chunks` with metadata (cluster_id, county, judge, date_filed).

## Future: CourtListener webhooks

CourtListener supports [webhooks](https://courtlistener.com/help/api/webhooks/) for new opinions. Later:

- Register a webhook for GA courts + “alienation” query.
- On new hit: fetch full text, upsert into raw_cases, trigger chunk+embed.

For now, periodic Modal runs are sufficient.

## Tables

| Table         | Purpose                               |
|---------------|----------------------------------------|
| `raw_cases`   | CourtListener metadata + optional text |
| `pipeline_runs` | Fetch/chunk/embed run logs          |
| `case_chunks` | Chunked text + embeddings for RAG      |
