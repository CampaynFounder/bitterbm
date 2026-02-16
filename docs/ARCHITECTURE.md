# Legal Intelligence Platform Architecture

Multi-layered parental alienation case strategy system.

## Components Overview

| Layer | Status | Implementation |
|-------|--------|----------------|
| **1. Case Law RAG** | ✅ Done | `case_chunks`, `match_case_chunks`, `training_ready_cases` |
| **2. Expert Profile RAG** | 📋 Schema ready | `experts`, `expert_profile_embeddings` |
| **3. Judge Analysis RAG** | 📋 Schema ready | `judges`, `judge_analysis_embeddings` |
| **4. Attorney Intelligence RAG** | 📋 Schema ready | `attorneys`, `attorney_intelligence_embeddings` |
| **5. Filing Analysis Engine** | 📋 Schema ready | `filing_embeddings` |
| **6. Super Lawyer Synthesis AI** | 🚧 Pending | Orchestration layer |

## Schema Mapping

### Existing (bitterbm)

| Table | Purpose |
|-------|---------|
| `cases` | User's legal matter (008) |
| `raw_cases` | CourtListener precedent cases |
| `case_chunks` | Case law chunks + embeddings (1536) |
| `evidence` | User uploads |
| `analysis_results` | AI analysis per case |
| `user_profiles` | User details (state, county, etc.) |

### New (Legal Intelligence)

| Table | Purpose |
|-------|---------|
| `judges` | Judicial profiles |
| `attorneys` | Attorney profiles |
| `experts` | GALs, psychologists, evaluators |
| `case_participants` | Links raw_cases → judges/attorneys/experts |
| `judge_analysis_embeddings` | Judge-specific RAG |
| `expert_profile_embeddings` | Expert-specific RAG |
| `attorney_intelligence_embeddings` | Attorney-specific RAG |
| `filing_embeddings` | User-uploaded filings RAG |

### Naming Notes

- **Precedent cases** = `raw_cases` (CourtListener source)
- **User cases** = `cases` (user's legal matter in 008)

## Data Pipeline

```
CourtListener API → raw_cases → training_ready_cases → case_chunks (embeddings)
                            → extract_judges → judges + case_participants
                                            → judge_analysis_embeddings
State Portals      → judges, attorneys, experts (future)
User uploads       → evidence, filing_embeddings
```

## Embedding Model

- **Current**: `text-embedding-3-small` (1536 dims)
- **Optional upgrade**: `text-embedding-3-large` (3072) for new RAGs

## API Layer

| Endpoint | Purpose |
|----------|---------|
| `POST /api/analyze` | Evidence analysis (Vision, no RAG) |
| `POST /api/save-results` | Persist analysis + evidence |
| `POST /api/admin/rag-test` | Case law RAG query |

**To add**: `/api/query-judge`, `/api/query-expert`, `/api/query-attorney`, `/api/analyze-filing`, `/api/strategy`

## Implementation Roadmap

### Phase 1: Foundation ✅
- [x] CourtListener ingestion
- [x] case_chunks + match_case_chunks
- [x] Case analysis (Vision)

### Phase 2: Entity Schema & Pipelines
- [x] Populate judges from raw_cases (extract_judges)
- [x] Judge → judge_analysis_embeddings (judge_chunk_embed)
- [ ] Expert profile aggregation (skeleton ready)
- [ ] Attorney intelligence pipeline (skeleton ready)
- [ ] Entity → embedding pipelines for attorney/expert

### Phase 3: RAG APIs
- [ ] Judge analysis API
- [ ] GAL/Expert analysis API
- [ ] Attorney analysis API
- [ ] Filing analysis API

### Phase 4: Super Lawyer AI
- [ ] Orchestrate all RAGs
- [ ] Unified strategy generation
- [ ] Confidence scoring
- [ ] Graceful degradation for missing data

## Data Sources

- **CourtListener**: Opinions, dockets, judge info
- **State court portals**: Case outcomes, GAL appointments
- **State bar**: Attorney disciplinary records
- **PACER** (via CourtListener): Filings, motion practice

## PDF Storage & Future Extraction

We store both plain_text (when available) and pdf_url for each raw_case. Cases with neither are skipped.

**PDF-only cases** (plain_text=NULL, pdf_url set) are stored for later extraction. When we accumulate enough:
- Run a PDF→text extraction job (PyMuPDF, or OpenAI Vision for scanned PDFs)
- Backfill plain_text; entity metadata (judge, county, state, court) is already on raw_cases for linking
