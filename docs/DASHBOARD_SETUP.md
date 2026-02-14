# Protected Pipeline Dashboard

A protected route to validate CourtListener → Storage → RAG pipeline status and eventual user-context retrieval.

## Routes (admin only, not in main UX)

| Route | Purpose |
|-------|---------|
| `/admin/login` | Sign in via magic link (email) |
| `/admin/auth/callback` | Handles Supabase auth redirect |
| `/admin/dashboard` | Pipeline status (protected) |

## Setup

### 1. Supabase tables

Run the migration in Supabase SQL Editor:

```bash
# Or: supabase db push (if using Supabase CLI)
```

SQL: `supabase/migrations/001_pipeline_tables.sql`

Creates: `raw_cases`, `pipeline_runs`, `case_chunks` (with pgvector).

### 2. Supabase Auth

- Enable Email auth in Supabase Dashboard → Authentication → Providers
- Add redirect URL: `https://yoursite.com/admin/auth/callback` (and `http://localhost:3000/admin/auth/callback` for dev)

### 3. Environment variables

Add to `.env.local` and to your deployment (e.g. Cloudflare Pages):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 4. Modal secrets

Ensure Modal has all secrets:

```bash
modal secret create courtlistener COURTLISTENER_API_TOKEN=xxx
modal secret create supabase-secret SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx
modal secret create pipeline-trigger TRIGGER_SECRET=your-random-string
```

### 5. Deploy Modal web endpoint

```bash
modal deploy modal_courtlistener_test.py
```

Copy the URL for `trigger_fetch` (e.g. `https://vannilli--courtlistener-test-trigger-fetch.modal.run`) and add to Cloudflare:

- `NEXT_PUBLIC_MODAL_TRIGGER_URL` = that URL
- `NEXT_PUBLIC_PIPELINE_TRIGGER_SECRET` = same value as `TRIGGER_SECRET`

### 6. Run fetch (CLI or dashboard)

CLI: `python3 -m modal run modal_courtlistener_test.py --action fetch --max-results 20`  
Or use the **Trigger fetch** button on `/admin/dashboard`.

## Dashboard sections

1. **CourtListener API** – Last fetch run, filters (query, courts), counts
2. **Storage (raw_cases)** – Total cases, counties, sample cases
3. **RAG (case_chunks)** – Chunk count (0 until chunk+embed step runs)
4. **User-context retrieval** – Placeholder for filtering by state, county, judge, alienation behaviors

## User-context retrieval (future)

Once `case_chunks` are populated, you’ll filter by:

- User state (GA for now)
- County (e.g. Fulton)
- Judge
- Alienation behaviors

To surface cases where alienation was effectively proven.
