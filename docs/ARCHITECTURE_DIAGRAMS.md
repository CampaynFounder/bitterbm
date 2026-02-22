# System Architecture Diagrams

## High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        CONFIGURATION PHASE                       │
│                         (One-Time Setup)                         │
└─────────────────────────────────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │   Court Website URL     │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  Playwright Codegen     │ ← Human operates browser
                    │  (Record Navigation)    │   (fill forms, click, etc.)
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  Python Converter       │
                    │  (Parse → Config JSON)  │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  Human Review           │ ← Validate field mappings
                    │  (Admin UI)             │   Adjust if needed
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  Validated Config       │
                    │  (Stored in DB)         │
                    └─────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        DATA COLLECTION PHASE                     │
│                         (Repeatable Process)                     │
└─────────────────────────────────────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  Define Search Params   │ ← Human sets criteria
                    │  (Date range, filters)  │   (2020-2024, all cases)
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  Run Search             │
                    │  (Extract Case IDs)     │ ← Automated (Playwright)
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  Superset Created       │
                    │  [ID1, ID2, ..., IDN]   │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  Queue All Cases        │
                    │  (Processing Queue)     │
                    └────────────┬────────────┘
                                 │
              ┌──────────────────┴──────────────────┐
              │                                     │
     ┌────────▼────────┐                  ┌────────▼────────┐
     │  Scrape Case    │                  │  Scrape Case    │
     │  (Metadata)     │ ← Parallel  →    │  (Metadata)     │
     └────────┬────────┘   Processing     └────────┬────────┘
              │                                     │
     ┌────────▼────────┐                  ┌────────▼────────┐
     │ Confidence > 0.8?│                 │ Confidence > 0.8?│
     └────────┬────────┘                  └────────┬────────┘
              │                                     │
       ┌──────┴──────┐                      ┌──────┴──────┐
       │ YES    NO   │                      │ YES    NO   │
       │      │      │                      │      │      │
       │      ▼      │                      │      ▼      │
       │  ┌────────┐ │                      │  ┌────────┐ │
       │  │ Review │ │                      │  │ Review │ │
       │  │ Queue  │ │                      │  │ Queue  │ │
       │  └────────┘ │                      │  └────────┘ │
       ▼             │                      ▼             │
     Save to DB      │                    Save to DB      │
       │             │                      │             │
       └─────────────┴──────────────────────┴─────────────┘
                           │
              ┌────────────▼────────────┐
              │  PDF Download Queue     │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Download All PDFs      │ ← Parallel processing
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Extract Text           │
              │  (pdfplumber/OCR)       │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Chunk Text             │
              │  (~1000 chars + overlap)│
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Generate Embeddings    │
              │  (OpenAI API)           │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Save to Vector DB      │
              │  (pgvector)             │
              └─────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                          QUERY PHASE                             │
│                       (User Interaction)                         │
└─────────────────────────────────────────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │  User Query             │
              │  "How does Judge X..."  │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Generate Embedding     │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Vector Similarity      │
              │  Search (pgvector)      │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Top 10 Relevant Chunks │
              │  + Metadata             │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Send to LLM            │
              │  (GPT-4 + Context)      │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Synthesized Answer     │
              │  + Source Citations     │
              └─────────────────────────┘
```

---

## Database Schema Relationships

```
┌──────────────┐
│   counties   │
│              │
│ - id         │
│ - name       │
│ - state      │
│ - base_url   │
│ - status     │
└───────┬──────┘
        │ 1:N
        ├─────────────────────────────┐
        │                             │
        ▼                             ▼
┌────────────────┐            ┌──────────────┐
│scraper_configs │            │  supersets   │
│                │            │              │
│ - county_id    │            │ - county_id  │
│ - nav_steps    │            │ - params     │
│ - rules        │            │ - case_ids[] │
│ - validated    │            │ - status     │
└────────────────┘            └──────┬───────┘
                                     │ 1:N
                                     ▼
                              ┌──────────────┐
                              │    cases     │
                              │              │
                              │ - case_num   │
                              │ - parties    │
                              │ - judge      │
                              │ - outcome    │
                              │ - raw_data   │
                              └──────┬───────┘
                                     │ 1:N
                                     ▼
                              ┌────────────────┐
                              │case_documents  │
                              │                │
                              │ - case_id      │
                              │ - url          │
                              │ - storage_path │
                              │ - text         │
                              └──────┬─────────┘
                                     │ 1:N
                                     ▼
                              ┌────────────────┐
                              │document_chunks │
                              │                │
                              │ - doc_id       │
                              │ - chunk_text   │
                              │ - embedding    │ ← pgvector
                              │ - metadata     │
                              └────────────────┘
```

---

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          FRONTEND                                │
│                        (Next.js App)                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/REST
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      NEXT.JS API ROUTES                          │
│                                                                  │
│  /api/pipeline/generate-superset                                │
│  /api/pipeline/convert-codegen                                  │
│  /api/pipeline/validate-config                                  │
│  /api/pipeline/process-queue                                    │
│  /api/pipeline/stats                                            │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   PYTHON PIPELINE SERVICE                        │
│                       (FastAPI)                                  │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐│
│  │ CodegenConverter│  │ DataPipeline    │  │ ScraperEngine   ││
│  └─────────────────┘  └─────────────────┘  └─────────────────┘│
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐│
│  │ PDFProcessor    │  │ TextExtractor   │  │ EmbeddingGen    ││
│  └─────────────────┘  └─────────────────┘  └─────────────────┘│
└────────┬─────────────────┬─────────────────────┬───────────────┘
         │                 │                     │
         ▼                 ▼                     ▼
┌─────────────┐  ┌──────────────┐  ┌──────────────────┐
│  Playwright │  │  Supabase    │  │  OpenAI API      │
│             │  │  (Postgres + │  │  (Embeddings)    │
│  Browser    │  │   Storage)   │  │                  │
│  Automation │  │              │  │                  │
└─────────────┘  └──────────────┘  └──────────────────┘
```

---

## Processing Queue State Machine

```
                    ┌────────┐
                    │ QUEUED │ ← Task created
                    └───┬────┘
                        │
                        ▼
                    ┌────────┐
                    │PROCESS-│
                    │  ING   │ ← Worker picks up task
                    └───┬────┘
                        │
            ┌───────────┼───────────┐
            │           │           │
            ▼           ▼           ▼
      ┌─────────┐  ┌─────────┐  ┌─────────┐
      │COMPLETE │  │ FAILED  │  │REQUIRES │
      │         │  │         │  │ REVIEW  │
      └─────────┘  └────┬────┘  └────┬────┘
                        │            │
                        │            └──────────┐
                        │                       │
                        ▼                       ▼
                  ┌─────────┐           ┌──────────┐
                  │attempts │           │  REVIEW  │
                  │   < 3?  │           │  QUEUE   │
                  └────┬────┘           └────┬─────┘
                       │                     │
                   YES │ NO                  │
                       │  │                  │
                       ▼  ▼                  ▼
                  ┌─────────┐         ┌──────────┐
                  │ QUEUED  │         │ MANUAL   │
                  │ (retry) │         │ APPROVED │
                  └─────────┘         └──────────┘
```

---

## Data Flow: Case Extraction

```
Court Website Page
       │
       ▼
┌──────────────┐
│ HTML/iframe  │
└──────┬───────┘
       │ Playwright
       ▼
┌──────────────┐
│  DOM Tree    │
└──────┬───────┘
       │ CSS Selectors
       ▼
┌──────────────┐
│ Raw Strings  │
│  - "John vs" │
│  - "2024-01" │
│  - "Smith J."│
└──────┬───────┘
       │ Parser
       ▼
┌──────────────┐
│  Structured  │
│  plaintiff:  │
│  defendant:  │
│  judge:      │
│  date:       │
└──────┬───────┘
       │ Confidence Score
       ▼
┌──────────────┐
│  > 0.8?      │
└──────┬───────┘
   YES │ NO
       │  │
       ▼  ▼
   Save  Review
    to    Queue
    DB
```

---

## Human-in-the-Loop Touchpoints

```
Setup Phase:
   │
   ├─ 1. Record Navigation    [HUMAN]
   ├─ 2. Auto-Convert Config  [AUTO]
   ├─ 3. Review & Validate    [HUMAN]
   └─ 4. Save Config          [AUTO]

Collection Phase:
   │
   ├─ 1. Define Criteria      [HUMAN]
   ├─ 2. Generate Superset    [AUTO]
   ├─ 3. Scrape All Cases     [AUTO]
   ├─ 4. Review Low-Conf      [HUMAN]
   ├─ 5. Download PDFs        [AUTO]
   ├─ 6. Extract & Embed      [AUTO]
   └─ 7. Store in DB          [AUTO]

Analysis Phase:
   │
   ├─ 1. Define Query         [HUMAN]
   ├─ 2. Vector Search        [AUTO]
   ├─ 3. LLM Synthesis        [AUTO]
   └─ 4. Interpret Results    [HUMAN]
```

---

**Legend:**
- `[HUMAN]` = Requires human input/decision
- `[AUTO]` = Fully automated
- `│ ▼ ├ └` = Flow direction
- `1:N` = One-to-many relationship
