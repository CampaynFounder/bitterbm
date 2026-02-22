# 🚀 Data Pipeline Workflow

## Complete workflow from County Configuration to RAG-Ready Data

---

## 📋 Overview

This pipeline extracts family court case data for qualitative and quantitative analysis:

- **Input**: County court website URL
- **Output**: Structured case data + embeddings for RAG queries
- **Approach**: Semi-automated with human-in-the-loop validation

---

## 🔄 Step-by-Step Process

### **Phase 1: County Setup (One-Time, Manual)**

#### 1.1 Add County
**Location**: Admin Portal → Data Pipeline → Counties Tab

1. Click "+ Add County"
2. Fill in:
   - County Name (e.g., "Cobb County")
   - State (e.g., "GA")
   - Court Type (Superior, Family, District)
   - Base URL
3. Save (status = `draft`)

#### 1.2 Record Navigation with Playwright Codegen

**Terminal Command**:
```bash
python3 -m playwright codegen https://your-county-court-site.com
```

**Actions to Record**:
1. Navigate to search page
2. Fill search form:
   - Party name: `%` (wildcard)
   - Date from: `01/01/2020`
   - Date to: `12/31/2024`
   - Select case types
3. Click "Search"
4. Click on a result row
5. Identify columns (case number, parties, judge, etc.)
6. Click expand icon (if nested tables exist)
7. Click PDF links
8. Save and close

**Output**: `recorded_code.py` (codegen output)

#### 1.3 Convert Codegen to Config

**API Call**:
```bash
curl -X POST http://localhost:3000/api/pipeline/convert-codegen \
  -H "Content-Type: application/json" \
  -d '{
    "code": "...",
    "county_id": "abc-123"
  }'
```

**Output**: Structured `scraper_config` (draft)

#### 1.4 Review & Validate Config

**Location**: Admin Portal → Data Pipeline → Counties → Configure Scraper

Review:
- ✅ Navigation steps correct?
- ✅ Search form fields mapped correctly?
- ✅ Results table structure identified?
- ✅ Extraction rules capture all needed fields?

Click "Validate" → Status changes to `active`

---

### **Phase 2: Generate Superset (Semi-Automated)**

#### 2.1 Create Superset

**Location**: Admin Portal → Data Pipeline → Supersets Tab

1. Click "+ Generate Superset"
2. Select validated county
3. Define search criteria:
   - Name: "Cobb Family Cases 2020-2024"
   - Date Range: 01/01/2020 - 12/31/2024
   - Party Name: `%` (all)
4. Click "Generate"

**What Happens**:
- Pipeline runs search using validated config
- Extracts all case IDs from results
- Saves to `supersets` table
- Queues individual cases for scraping

**Output**: List of case IDs (e.g., 5,000 cases)

---

### **Phase 3: Scrape Cases (Automated with Sampling Review)**

#### 3.1 Queue Processing

**Automatic**:
- System automatically queues all cases from superset
- Processing queue runs in background
- For each case:
  - Navigate to case detail page
  - Extract metadata (parties, judge, outcome)
  - Extract events table
  - Extract PDF links
  - Calculate confidence score
  - If confidence < 0.8 → Queue for review
  - If random sample (10%) → Queue for review

#### 3.2 Monitor Progress

**Location**: Admin Portal → Data Pipeline → Processing Queue

View:
- Queued: Tasks waiting
- Processing: Currently running
- Complete: Finished successfully
- Failed: Errors (auto-retry up to 3x)

#### 3.3 Review Low-Confidence Cases

**Location**: Admin Portal → Data Pipeline → Review Queue

For each flagged case:
1. View extracted data
2. Verify accuracy
3. Correct if needed
4. Approve or Reject

**Actions**:
- ✅ Approve → Mark case as validated
- ❌ Reject → Flag for re-scraping or manual entry
- 📝 Edit → Update extraction rules for future cases

---

### **Phase 4: PDF Download & Processing (Automated)**

#### 4.1 Download PDFs

For each case with PDF links:
- Download to Supabase Storage
- Save metadata (`case_documents` table)
- Queue for text extraction

#### 4.2 Extract Text

**Methods**:
1. **Text-based PDFs**: Use `pdfplumber` or `PyPDF2`
2. **Scanned PDFs**: Use OCR (Tesseract, AWS Textract)
3. **Mixed**: Hybrid approach

**Output**: Plain text stored in `extracted_text` column

#### 4.3 Chunk Text

- Split into ~1000 character chunks
- 200 character overlap
- Save to `document_chunks` table

---

### **Phase 5: Generate Embeddings (Automated)**

#### 5.1 Embed Chunks

For each chunk:
```python
import openai

embedding = openai.embeddings.create(
  model="text-embedding-3-small",
  input=chunk_text
)

# Save to document_chunks.embedding
```

#### 5.2 Add Metadata

Each chunk includes searchable metadata:
```json
{
  "case_number": "19-CV-12345",
  "judge": "Smith",
  "case_type": "custody",
  "outcome": "joint custody",
  "filed_date": "2020-01-15",
  "mentions_case_law": true,
  "case_law_citations": ["Smith v. Jones"]
}
```

---

## 📊 Analytics & Insights

### **Judge Analysis**

Query: "Show me Judge Smith's custody rulings"

```sql
SELECT 
  judge,
  COUNT(*) as total_cases,
  SUM(CASE WHEN outcome LIKE '%father%' THEN 1 ELSE 0 END) as custody_to_father,
  SUM(CASE WHEN outcome LIKE '%mother%' THEN 1 ELSE 0 END) as custody_to_mother,
  SUM(CASE WHEN outcome LIKE '%joint%' THEN 1 ELSE 0 END) as joint_custody
FROM cases
WHERE judge = 'Smith'
GROUP BY judge
```

### **Attorney Performance**

Track wins/losses per judge:
```sql
SELECT 
  attorney_name,
  judge,
  COUNT(*) as cases,
  SUM(CASE WHEN outcome = 'win' THEN 1 ELSE 0 END) as wins
FROM cases
GROUP BY attorney_name, judge
```

### **RAG Query**

Query: "What factors does Judge Smith consider in custody cases?"

1. Generate query embedding
2. Search `document_chunks` with filters:
   - `metadata->>'judge' = 'Smith'`
   - `metadata->>'case_type' = 'custody'`
3. Return top 10 most relevant chunks
4. Send to LLM for synthesis

---

## 🛠️ Tech Stack

### **Backend**
- Python (Playwright, FastAPI)
- Supabase (Postgres + Vector extension)
- OpenAI (Embeddings + LLM)

### **Frontend**
- Next.js + React
- Tailwind CSS
- Supabase Client

### **Storage**
- Supabase Storage (PDFs)
- Postgres (structured data)
- pgvector (embeddings)

---

## ⚙️ Configuration Files

### **1. Database Schema**
`/supabase/migrations/024_county_scraper_pipeline.sql`

### **2. Pipeline Orchestrator**
`/scraper/pipeline/data_pipeline.py`

### **3. Codegen Converter**
`/scraper/pipeline/codegen_converter.py`

### **4. Admin UI**
`/app/admin/data-pipeline/page.tsx`

### **5. Example County Scraper**
`/scraper/sites/cobb_county_scraper.py`

---

## 🚦 Human-in-the-Loop Checkpoints

| Phase | Checkpoint | Action |
|-------|-----------|--------|
| Setup | After codegen | Review config, validate fields |
| Superset | After generation | Verify case count, sample check |
| Scraping | Low confidence cases | Review & approve/correct |
| Scraping | Random 10% sample | Quality assurance |
| PDF Processing | OCR failures | Manual review |
| Analytics | Initial queries | Validate results |

---

## 📈 Scalability

### **Single County**
- 5,000 cases
- ~50 PDFs per case
- **Total**: 250,000 PDFs
- **Processing Time**: ~2-3 days (with parallelization)

### **Multiple Counties**
- Configure once per county
- Run in parallel
- Centralized analytics across all counties

### **Performance**
- Queue-based processing (no overload)
- Automatic retries for failures
- Configurable batch sizes
- Rate limiting for politeness

---

## 🎯 Next Steps

1. ✅ Run database migration
2. ✅ Set up first county (Cobb County)
3. ✅ Generate test superset (small date range)
4. ✅ Review sample cases
5. ✅ Scale up to full date range
6. ✅ Add more counties

---

## 📞 Support

For issues or questions:
1. Check review queue for stuck items
2. Monitor processing queue for failed tasks
3. Review error logs in `processing_queue.error_message`
