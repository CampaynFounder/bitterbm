# Table Name Mapping Reference

The migration `025_scraper_pipeline_fixed.sql` uses unique table names to avoid conflicts with existing tables.

## Table Name Changes

| Original Name (024) | New Name (025) | Purpose |
|---------------------|----------------|---------|
| `counties` | `scraper_counties` | Court systems being scraped |
| `scraper_configs` | `scraper_configs` | ✅ No change |
| `supersets` | `scraper_supersets` | Search result batches |
| `cases` | `scraped_cases` | Extracted case data |
| `case_documents` | `scraped_documents` | PDFs and documents |
| `document_chunks` | `scraped_doc_chunks` | Text chunks for RAG |
| `processing_queue` | `scraper_queue` | Background tasks |
| `review_queue` | `scraper_review_queue` | Human review items |
| `judges` | `scraper_judges` | Judge analytics |
| `attorneys` | `scraper_attorneys` | Attorney analytics |

## Function Name Changes

| Original | New |
|----------|-----|
| `match_documents()` | `match_scraped_documents()` |

## Files That Need Updating

### 1. Python Files

**`scraper/pipeline/data_pipeline.py`**
- Replace all `.table('counties')` → `.table('scraper_counties')`
- Replace all `.table('supersets')` → `.table('scraper_supersets')`
- Replace all `.table('cases')` → `.table('scraped_cases')`
- Replace all `.table('case_documents')` → `.table('scraped_documents')`
- Replace all `.table('document_chunks')` → `.table('scraped_doc_chunks')`
- Replace all `.table('processing_queue')` → `.table('scraper_queue')`
- Replace all `.table('review_queue')` → `.table('scraper_review_queue')`

**`scraper/pipeline/api.py`**
- Replace all `.table('supersets')` → `.table('scraper_supersets')`

### 2. TypeScript Files

**`app/admin/data-pipeline/page.tsx`**
- Replace all `.from('counties')` → `.from('scraper_counties')`
- Replace all `.from('supersets')` → `.from('scraper_supersets')`
- Replace all `.from('cases')` → `.from('scraped_cases')`
- Replace all `.from('case_documents')` → `.from('scraped_documents')`
- Replace all `.from('processing_queue')` → `.from('scraper_queue')`
- Replace all `.from('review_queue')` → `.from('scraper_review_queue')`

**`app/api/pipeline/*/route.ts`** (5 files)
- Same replacements as above

### 3. SQL Files

**Documentation examples** in:
- `docs/PIPELINE_SETUP.md`
- `docs/DATA_PIPELINE_WORKFLOW.md`
- `docs/SYSTEM_SUMMARY.md`

Replace table names in SQL examples.

## Quick Find & Replace

Use these regex patterns for bulk replacement:

```bash
# Python files
\.table\('counties'\)        → .table('scraper_counties')
\.table\('supersets'\)       → .table('scraper_supersets')
\.table\('cases'\)           → .table('scraped_cases')
\.table\('case_documents'\)  → .table('scraped_documents')
\.table\('document_chunks'\) → .table('scraped_doc_chunks')
\.table\('processing_queue'\) → .table('scraper_queue')
\.table\('review_queue'\)    → .table('scraper_review_queue')

# TypeScript files
\.from\('counties'\)         → .from('scraper_counties')
\.from\('supersets'\)        → .from('scraper_supersets')
\.from\('cases'\)            → .from('scraped_cases')
\.from\('case_documents'\)   → .from('scraped_documents')
\.from\('processing_queue'\) → .from('scraper_queue')
\.from\('review_queue'\)     → .from('scraper_review_queue')
```

## Migration Steps

1. **Delete old migration** (optional, if not run yet):
   ```bash
   rm supabase/migrations/024_county_scraper_pipeline.sql
   ```

2. **Run new migration**:
   ```bash
   supabase db push
   ```

3. **Update code files** using find & replace above

4. **Test** that tables are accessible

## Why This Change Was Needed

The original migration (024) used generic names like `counties`, `cases`, `documents` which conflicted with existing tables in your schema (from the CourtListener pipeline). The new migration (025) uses prefixed names like `scraper_counties`, `scraped_cases` to avoid conflicts.

## Verification

After updating, verify the tables exist:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE 'scraper%' 
  OR table_name LIKE 'scraped%';
```

Should return:
- scraper_counties
- scraper_configs
- scraper_supersets
- scraped_cases
- scraped_documents
- scraped_doc_chunks
- scraper_queue
- scraper_review_queue
- scraper_judges
- scraper_attorneys
