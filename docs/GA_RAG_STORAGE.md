# GA Alienation RAG Storage – Best Practices

Storage strategy for Georgia parental alienation case law from CourtListener, optimized for GA users and future RAG retrieval.

## Data flow

```
CourtListener API (opinions only, appellate courts)
    ↓ q=(alienat*) AND (court_id:ga OR court_id:gactapp)
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
- `county` inferred from court name when possible; defaults to `"Georgia"` for statewide courts (ga, gactapp).

### 3. PDF storage

- When CourtListener provides `local_path` for an opinion, the pipeline downloads the PDF and uploads it to Supabase Storage (`case-pdfs` bucket).
- `pdf_url` in `raw_cases` points to the stored PDF (public URL).
- Bucket `case-pdfs` is created automatically if it does not exist.

### 4. Training-ready filter (plain text required)

- **Only cases with usable plain_text are stored.** Use `fetch_full_text=true`.
- Minimum 200 chars; cases without text or with stub content are skipped.
- State and county are always set (statewide appellate courts use state name for county).
- `training_ready_cases` view: `SELECT * FROM training_ready_cases` for chunk/embed.

### 5. Audit trail

- `pipeline_runs` logs each fetch: step, counts, filters, timestamp.
- Use `filed_after` for incremental runs (e.g. last successful run date).

### 6. Indexes

- `raw_cases`: unique(cluster_id, source), indexes on cluster_id, state, county, date_filed.
- `case_chunks`: cluster_id, county, date_filed + vector index for similarity search.

## GA RAG build (Option B: single RAG, filter by state)

1. **Fetch with full text** – Run fetch with `fetch_full_text=true` for cases to be used in RAG.
2. **Chunk + Embed** – Run `modal run modal_rag.py chunk_embed --state GA` or `python scripts/chunk_embed.py --state GA`
   - Reads `training_ready_cases`, chunks `plain_text` (~2000 chars, 512 overlap)
   - Embeds via OpenAI `text-embedding-3-small`, inserts into `case_chunks` with `state`
3. **Retrieve** – `rag.retrieve(query, state="GA", top_k=5)` for semantic search with state filter
4. **Ask** – `rag.ask(question, state="GA")` retrieves chunks, then answers via Claude

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
