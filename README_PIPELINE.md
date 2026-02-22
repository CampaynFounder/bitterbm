# 🏛️ Legal Data Pipeline

**Automated, scalable system for extracting and analyzing family court case data**

Extract case data, court documents, and judicial reasoning from public court websites. Generate structured data and vector embeddings for quantitative analysis and RAG-powered legal research.

---

## 🎯 What It Does

Transform this:
- 🌐 Court website with search forms and case details
- 📄 Thousands of cases with PDFs

Into this:
- 📊 Structured database of cases, parties, judges, outcomes
- 🤖 Vector embeddings for semantic search
- 📈 Analytics on judge performance, attorney success rates
- 💬 RAG-powered answers to legal research questions

---

## ⚡ Quick Start

```bash
# 1. Clone and setup
git clone <repo>
cd bitterbm
./setup.sh

# 2. Configure environment
# Edit .env.local with your API keys

# 3. Run migrations
supabase db push

# 4. Start development servers
./dev.sh
```

**Access:**
- Admin Dashboard: http://localhost:3000/admin/data-pipeline
- API Docs: http://localhost:8000/docs

---

## 📖 Documentation

| Document | Purpose |
|----------|---------|
| [SYSTEM_SUMMARY.md](docs/SYSTEM_SUMMARY.md) | Complete system overview |
| [DATA_PIPELINE_WORKFLOW.md](docs/DATA_PIPELINE_WORKFLOW.md) | Step-by-step usage guide |
| [PIPELINE_SETUP.md](docs/PIPELINE_SETUP.md) | Installation & deployment |

---

## 🏗️ Architecture

```
┌─────────────────┐
│  Court Website  │
└────────┬────────┘
         │
         ↓ (Playwright Codegen)
┌─────────────────┐
│ Scraper Config  │ ← Human validates
└────────┬────────┘
         │
         ↓ (Generate Superset)
┌─────────────────┐
│  Case ID List   │
└────────┬────────┘
         │
         ↓ (Queue Processing)
┌─────────────────┐
│  Extracted      │
│  Cases + PDFs   │
└────────┬────────┘
         │
         ↓ (Chunking + Embeddings)
┌─────────────────┐
│   Vector DB     │
└────────┬────────┘
         │
         ↓ (RAG Query)
┌─────────────────┐
│    Insights     │
└─────────────────┘
```

---

## 🚀 Key Features

### 1. **Semi-Automated Configuration**
- Record once per county using Playwright Codegen
- Auto-convert to structured config
- Human validation ensures accuracy

### 2. **Scalable Processing**
- Queue-based architecture
- Process thousands of cases in parallel
- Automatic retries and error handling

### 3. **Quality Control**
- Confidence scoring on extractions
- Human review queue for low-confidence cases
- Random sampling for quality assurance

### 4. **RAG-Ready Output**
- PDF download and text extraction
- Intelligent chunking with overlap
- OpenAI embeddings for semantic search
- Metadata-rich for precise filtering

### 5. **Analytics Dashboard**
- Real-time processing statistics
- Judge and attorney performance tracking
- Case outcome trends
- Visual insights

---

## 📊 Example Use Cases

### 1. Judge Analysis
**Question:** "How does Judge Smith rule on custody disputes?"

**Process:**
```python
# Vector search for Judge Smith custody cases
results = supabase.rpc('match_documents', {
    'query_embedding': embed(query),
    'filter_judge': 'Smith',
    'filter_case_type': 'custody'
})

# LLM synthesis
answer = openai.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": f"Context: {results}\n\nQuestion: {query}"}]
)
```

### 2. Attorney Success Rates
```sql
SELECT 
  attorney,
  judge,
  COUNT(*) as total_cases,
  SUM(CASE WHEN outcome = 'win' THEN 1 ELSE 0 END) as wins,
  ROUND(100.0 * SUM(CASE WHEN outcome = 'win' THEN 1 ELSE 0 END) / COUNT(*), 1) as win_rate
FROM cases
GROUP BY attorney, judge
HAVING COUNT(*) >= 5
ORDER BY win_rate DESC;
```

### 3. Case Law Trends
**Question:** "Which cases does Judge Smith cite most often?"

Extract citations → Count frequency → Analyze context

---

## 🛠️ Tech Stack

**Backend:**
- Python 3.9+ (Playwright, FastAPI)
- PostgreSQL + pgvector (Supabase)
- OpenAI API (Embeddings)

**Frontend:**
- Next.js 14
- React + TypeScript
- Tailwind CSS

**Infrastructure:**
- Supabase (Database + Storage)
- Vercel/Railway (Deployment)

---

## 📂 Project Structure

```
bitterbm/
├── app/                          # Next.js app
│   ├── admin/data-pipeline/      # Admin dashboard
│   └── api/pipeline/             # API routes
│
├── scraper/
│   ├── pipeline/                 # Core pipeline logic
│   │   ├── data_pipeline.py      # Main orchestrator
│   │   ├── codegen_converter.py  # Codegen → Config
│   │   └── api.py                # FastAPI service
│   │
│   ├── sites/                    # County-specific scrapers
│   └── builder/                  # Helper tools
│
├── supabase/
│   └── migrations/               # Database schema
│
├── docs/                         # Documentation
│
├── setup.sh                      # Setup script
└── dev.sh                        # Dev server starter
```

---

## 🔄 Typical Workflow

### Configure County (One-Time)
1. Add county in admin UI
2. Run `playwright codegen` to record navigation
3. Convert codegen output to config
4. Review and validate

### Generate Data (Repeatable)
1. Create superset with search criteria
2. System automatically scrapes all cases
3. Review low-confidence extractions
4. PDFs downloaded and processed
5. Embeddings generated

### Query & Analyze
1. Use RAG for qualitative insights
2. Use SQL for quantitative analysis
3. Export results for reports

---

## 📈 Performance

**Sample County (5,000 cases):**
- Configuration: ~2 hours (one-time)
- Superset generation: ~10 minutes
- Case scraping: ~2-3 days (parallel)
- PDF processing: ~1 week (parallel)
- **Total setup + data collection: ~2 weeks**

**After initial setup:**
- New date ranges: ~minutes (superset)
- Full processing: ~days (automatic)

---

## 🔐 Security & Privacy

- All data is publicly available court records
- No authentication bypass or unauthorized access
- Respects robots.txt and rate limiting
- Environment variables for sensitive keys
- Row-level security in Supabase

---

## 🤝 Contributing

This is a production system for legal data research. Contact maintainers for access.

---

## 📜 License

Proprietary - All Rights Reserved

---

## 🆘 Support

- **Setup Issues:** See [PIPELINE_SETUP.md](docs/PIPELINE_SETUP.md#troubleshooting)
- **Workflow Questions:** See [DATA_PIPELINE_WORKFLOW.md](docs/DATA_PIPELINE_WORKFLOW.md)
- **Technical Details:** See [SYSTEM_SUMMARY.md](docs/SYSTEM_SUMMARY.md)

---

## ✅ Status

**Current State:** ✅ Production Ready

**Completed:**
- ✅ Database schema
- ✅ Core pipeline logic
- ✅ Admin dashboard
- ✅ Codegen converter
- ✅ API endpoints
- ✅ Setup scripts
- ✅ Documentation

**Next Steps:**
1. Run `./setup.sh` to install dependencies
2. Configure first county
3. Generate test superset
4. Scale to full data collection

---

**Built for legal professionals who need data-driven insights into court systems.**
