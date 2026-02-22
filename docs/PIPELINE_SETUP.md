# 🚀 Legal Data Pipeline - Setup Guide

Complete guide to set up and run the automated legal data extraction pipeline.

---

## 📦 Prerequisites

### 1. System Requirements
- Python 3.9+
- Node.js 18+
- PostgreSQL 14+ (or Supabase account)

### 2. Required Python Packages
```bash
pip install playwright fastapi uvicorn supabase openai \
    pdfplumber pytesseract pdf2image aiohttp python-multipart
```

### 3. Install Playwright Browsers
```bash
python3 -m playwright install chromium
```

### 4. Optional (for OCR)
```bash
# macOS
brew install tesseract poppler

# Ubuntu
sudo apt-get install tesseract-ocr poppler-utils
```

---

## 🔧 Configuration

### 1. Environment Variables

Create `.env.local` in project root:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI
OPENAI_API_KEY=sk-your-api-key

# Pipeline
PIPELINE_STORAGE_PATH=./data/pdfs
PIPELINE_CONFIDENCE_THRESHOLD=0.8
PIPELINE_SAMPLE_REVIEW_RATE=0.1
```

### 2. Database Setup

Run migrations:

```bash
# Using Supabase CLI
supabase db push

# Or manually apply
psql -h your-db-host -U postgres -d postgres \
  -f supabase/migrations/024_county_scraper_pipeline.sql
```

### 3. Enable pgvector Extension

In Supabase dashboard or psql:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## 🚀 Running the System

### Start the Pipeline Service

Terminal 1:
```bash
cd scraper/pipeline
uvicorn api:app --reload --port 8000
```

### Start Next.js Dev Server

Terminal 2:
```bash
npm run dev
```

### Start Background Worker (Optional)

Terminal 3:
```bash
python3 -m scraper.pipeline.worker
```

---

## 📋 Step-by-Step Usage

### Phase 1: Configure a County

1. Navigate to `http://localhost:3000/admin/data-pipeline`
2. Click "Counties" tab
3. Click "+ Add County"
4. Fill in:
   - Name: `Cobb County`
   - State: `GA`
   - Court Type: `Superior`
   - Base URL: `https://superiorcourtclerk.cobbcounty.gov/...`
5. Save

### Phase 2: Record Navigation Flow

```bash
python3 -m playwright codegen https://your-county-court-site.com
```

**What to Record:**
1. Navigate to search page
2. Fill search form with test data
3. Click "Search"
4. Click on a result row to view case details
5. Note the columns you need to extract
6. Click expand icons if nested tables exist
7. Click PDF links to identify them
8. Close browser (Ctrl+C to save)

**Output:** `recorded_code.py`

### Phase 3: Convert Codegen to Config

```bash
# Copy the codegen output
cat recorded_code.py | pbcopy

# In admin UI:
# 1. Go to Counties → Your County → "Configure Scraper"
# 2. Paste codegen output
# 3. Click "Convert"
```

Or via API:

```bash
curl -X POST http://localhost:3000/api/pipeline/convert-codegen \
  -H "Content-Type: application/json" \
  -d '{
    "code": "...",
    "county_id": "abc-123"
  }'
```

### Phase 4: Review & Validate Config

In admin UI:
1. Review generated config
2. Verify field mappings are correct
3. Adjust if needed
4. Click "Validate"

### Phase 5: Generate Superset

1. Go to "Supersets" tab
2. Click "+ Generate Superset"
3. Select your county
4. Fill in search criteria:
   - Name: `Cobb Family Cases 2020-2024`
   - Date From: `2020-01-01`
   - Date To: `2024-12-31`
   - Party Name: `%` (wildcard for all)
5. Click "Generate"

**Monitor Progress:**
- Watch "Processing Queue" tab
- Check "Review Queue" for low-confidence cases

### Phase 6: Review Cases

As cases are processed, some will appear in the Review Queue:
1. Go to "Review Queue" tab
2. Click on a case to review
3. Verify extracted data is correct
4. Approve or correct as needed

---

## 🔍 Querying Data

### RAG Query Example

```python
from openai import OpenAI
from supabase import create_client

client = OpenAI()
supabase = create_client(supabase_url, supabase_key)

# Generate query embedding
query = "What factors does Judge Smith consider in custody cases?"
query_embedding = client.embeddings.create(
    model="text-embedding-3-small",
    input=query
).data[0].embedding

# Search similar chunks
result = supabase.rpc(
    'match_documents',
    {
        'query_embedding': query_embedding,
        'match_threshold': 0.7,
        'match_count': 10,
        'filter_judge': 'Smith',
        'filter_case_type': 'custody'
    }
).execute()

# Send to LLM for synthesis
chunks = [r['chunk_text'] for r in result.data]
context = "\n\n".join(chunks)

answer = client.chat.completions.create(
    model="gpt-4",
    messages=[
        {"role": "system", "content": "You are a legal analyst."},
        {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {query}"}
    ]
)

print(answer.choices[0].message.content)
```

### SQL Analytics Example

```sql
-- Judge statistics
SELECT 
  judge,
  COUNT(*) as total_cases,
  SUM(CASE WHEN outcome LIKE '%father%' THEN 1 ELSE 0 END) as father_custody,
  SUM(CASE WHEN outcome LIKE '%mother%' THEN 1 ELSE 0 END) as mother_custody,
  SUM(CASE WHEN outcome LIKE '%joint%' THEN 1 ELSE 0 END) as joint_custody
FROM cases
WHERE case_type = 'custody'
  AND filed_date >= '2020-01-01'
GROUP BY judge
ORDER BY total_cases DESC;
```

---

## 🛠️ Troubleshooting

### Pipeline Service Not Starting

**Error:** `ModuleNotFoundError: No module named 'fastapi'`

**Fix:**
```bash
pip install fastapi uvicorn
```

### Playwright Errors

**Error:** `Executable doesn't exist at /path/to/chromium`

**Fix:**
```bash
python3 -m playwright install chromium
```

### Supabase Connection Errors

**Error:** `ApiError: invalid API key`

**Fix:**
- Check `.env.local` has correct keys
- Ensure `SUPABASE_SERVICE_ROLE_KEY` is set (not anon key)

### PDF Download Failures

**Error:** `Failed to download PDF: 403`

**Fix:**
- Site may require authentication
- Add cookie/session handling to `_download_pdf`
- Or download PDFs during scraping phase instead

### OCR Quality Issues

**Fix:**
- Ensure Tesseract is installed
- Try preprocessing images (deskew, denoise)
- Consider using cloud OCR (AWS Textract, Google Vision)

---

## 📊 Performance Tuning

### Increase Parallelization

Edit `scraper/pipeline/api.py`:

```python
async def continuous_worker():
    while True:
        # Process 50 tasks at a time
        await pipeline.process_queue(limit=50)
        await asyncio.sleep(5)  # Check every 5 seconds
```

### Rate Limiting

Add delays to respect site limits:

```python
# In _scrape_case_details
await page.wait_for_timeout(2000)  # 2 second delay between requests
```

### Batch Processing

Process in batches:

```bash
# Terminal
curl -X POST http://localhost:8000/pipeline/process-queue \
  -H "Content-Type: application/json" \
  -d '{"limit": 100}'
```

---

## 🔐 Security

### Production Deployment

1. Use environment variables (never commit keys)
2. Enable RLS (Row Level Security) in Supabase
3. Use HTTPS for all endpoints
4. Add authentication to admin portal
5. Rate limit API endpoints
6. Validate all user inputs

### Supabase RLS Example

```sql
-- Only authenticated users can access
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view cases"
ON cases FOR SELECT
TO authenticated
USING (true);
```

---

## 📈 Scaling to Multiple Counties

1. Configure each county once
2. Run supersets in parallel
3. Queue processing handles all counties automatically
4. Monitor via dashboard

**Example: Adding 10 Counties**

- Initial setup: ~2 hours per county (one-time)
- Superset generation: ~10 minutes per county
- Case scraping: ~2-3 days total (parallel)
- PDF processing: ~1 week total (parallel)

---

## 🆘 Support & Maintenance

### Monitor Queue Status

```sql
SELECT 
  task_type,
  status,
  COUNT(*) as count
FROM processing_queue
GROUP BY task_type, status;
```

### Clear Failed Tasks

```sql
-- Reset failed tasks for retry
UPDATE processing_queue
SET status = 'queued', attempts = 0
WHERE status = 'failed' AND attempts < max_attempts;
```

### Backup Data

```bash
# Export cases to JSON
supabase db dump --data-only --table cases > cases_backup.sql

# Export embeddings
supabase db dump --data-only --table document_chunks > chunks_backup.sql
```

---

## 📚 Additional Resources

- [Playwright Documentation](https://playwright.dev/python/)
- [Supabase Vector Guide](https://supabase.com/docs/guides/ai)
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)
- [FastAPI Docs](https://fastapi.tiangolo.com/)

---

## ✅ Checklist

- [ ] Install all dependencies
- [ ] Set up environment variables
- [ ] Run database migrations
- [ ] Start pipeline service
- [ ] Start Next.js dev server
- [ ] Add first county
- [ ] Record navigation with codegen
- [ ] Convert and validate config
- [ ] Generate test superset
- [ ] Review sample cases
- [ ] Scale to full date range
- [ ] Add more counties
- [ ] Set up production deployment

---

**Need Help?** Check the troubleshooting section or review error logs in the processing queue.
