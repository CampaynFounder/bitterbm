-- Database schema for county configuration
-- /Users/pharrenlowther/projects/bitterbm/supabase/migrations/024_county_scraper_pipeline.sql

-- Counties/Court Systems
CREATE TABLE IF NOT EXISTS counties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  court_type TEXT, -- 'superior', 'family', 'district'
  base_url TEXT NOT NULL,
  status TEXT DEFAULT 'draft', -- draft, configured, active, paused
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scraper Configuration (from codegen conversion)
CREATE TABLE IF NOT EXISTS scraper_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  county_id UUID REFERENCES counties(id) ON DELETE CASCADE,
  version INTEGER DEFAULT 1,
  
  -- Navigation config
  navigation_steps JSONB NOT NULL, -- [{type: 'fill', selector: '#search', value: '{{party_name}}'}]
  
  -- Search form config
  search_form JSONB, -- {party_name_field: '#tbSearch4', date_from_field: '#tbFiledFrom', ...}
  
  -- Results table config
  results_table JSONB, -- {table_selector: 'table', row_selector: 'tbody tr', pagination: {...}}
  
  -- Case detail config
  case_detail JSONB, -- {url_pattern: '/case/{{id}}', fields: {...}}
  
  -- Extraction rules
  extraction_rules JSONB NOT NULL,
  /* Example:
  {
    "case_number": {"selector": "td:nth-child(1)", "type": "text"},
    "parties": {"selector": "td:nth-child(2)", "type": "text"},
    "judge": {"selector": "td:nth-child(8)", "type": "text"},
    "events_table": {
      "selector": "#EventGrid",
      "row_selector": "tbody tr",
      "columns": {
        "event_type": {"index": 2, "type": "text"},
        "pdf_link": {"index": 3, "selector": "a", "type": "href"}
      }
    }
  }
  */
  
  -- Validation status
  is_validated BOOLEAN DEFAULT FALSE,
  validated_at TIMESTAMPTZ,
  validated_by UUID,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Supersets (Search result batches)
CREATE TABLE IF NOT EXISTS supersets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  county_id UUID REFERENCES counties(id) ON DELETE CASCADE,
  name TEXT, -- 'Cobb County Family Cases 2020-2024'
  
  -- Search criteria used
  search_params JSONB NOT NULL,
  /* Example:
  {
    "party_name": "%",
    "date_from": "01/01/2020",
    "date_to": "12/31/2024",
    "case_types": ["Family", "Custody"]
  }
  */
  
  -- Results
  case_ids JSONB, -- ['case-123', 'case-456', ...]
  total_cases INTEGER DEFAULT 0,
  
  -- Processing status
  status TEXT DEFAULT 'pending', -- pending, collecting, processing, complete, failed
  progress INTEGER DEFAULT 0, -- 0-100
  
  -- Errors
  error_log JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cases (Extracted data)
CREATE TABLE IF NOT EXISTS cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  county_id UUID REFERENCES counties(id),
  superset_id UUID REFERENCES supersets(id),
  
  -- Identifiers
  case_number TEXT NOT NULL,
  external_case_id TEXT, -- ID from external system
  
  -- Case info
  case_type TEXT,
  case_status TEXT, -- active, closed, dismissed
  filed_date DATE,
  closed_date DATE,
  
  -- Parties (parsed from text)
  plaintiff TEXT,
  defendant TEXT,
  all_parties JSONB, -- [{name: 'John Doe', role: 'Plaintiff', attorney: '...'}]
  
  -- Court
  judge TEXT,
  court_division TEXT,
  
  -- Outcome
  outcome TEXT, -- 'Joint custody', 'Custody to mother', etc.
  outcome_summary TEXT,
  
  -- Raw data
  raw_data JSONB, -- All extracted fields
  
  -- Processing
  extraction_status TEXT DEFAULT 'pending', -- pending, extracted, reviewed, validated
  needs_review BOOLEAN DEFAULT FALSE,
  review_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(county_id, case_number)
);

-- Documents (PDFs, orders, etc.)
CREATE TABLE IF NOT EXISTS case_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  
  -- Document info
  document_type TEXT, -- 'Order Final', 'Motion', 'Brief', etc.
  document_title TEXT,
  filed_date DATE,
  
  -- Storage
  source_url TEXT,
  storage_path TEXT, -- Supabase storage path
  file_size_bytes BIGINT,
  page_count INTEGER,
  
  -- Extraction
  extracted_text TEXT,
  extraction_method TEXT, -- 'ocr', 'text', 'manual'
  extraction_quality FLOAT, -- 0.0-1.0
  
  -- Processing
  status TEXT DEFAULT 'pending', -- pending, downloaded, extracted, chunked, embedded
  needs_review BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document Chunks (for RAG)
CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES case_documents(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  
  -- Chunk data
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  page_number INTEGER,
  
  -- Embeddings
  embedding VECTOR(1536), -- OpenAI text-embedding-3-small
  
  -- Metadata for filtering
  metadata JSONB NOT NULL,
  /* Example:
  {
    "case_number": "19-CV-12345",
    "judge": "Smith",
    "case_type": "custody",
    "document_type": "Order Final",
    "filed_date": "2024-01-15",
    "outcome": "joint custody",
    "mentions_case_law": true,
    "case_law_citations": ["Smith v. Jones", "..."]
  }
  */
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(document_id, chunk_index)
);

-- Processing Queue
CREATE TABLE IF NOT EXISTS processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Task info
  task_type TEXT NOT NULL, -- 'collect_superset', 'scrape_case', 'download_pdf', 'extract_text', 'generate_embeddings'
  priority INTEGER DEFAULT 0,
  
  -- References
  county_id UUID REFERENCES counties(id),
  superset_id UUID REFERENCES supersets(id),
  case_id UUID REFERENCES cases(id),
  document_id UUID REFERENCES case_documents(id),
  
  -- Task data
  task_data JSONB,
  
  -- Status
  status TEXT DEFAULT 'queued', -- queued, processing, complete, failed, requires_review
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  
  -- Results
  result JSONB,
  error_message TEXT,
  
  -- Timing
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Review Queue (Human in the loop)
CREATE TABLE IF NOT EXISTS review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What needs review
  review_type TEXT NOT NULL, -- 'scraper_config', 'case_extraction', 'party_parsing', 'outcome_classification'
  
  -- References
  county_id UUID REFERENCES counties(id),
  case_id UUID REFERENCES cases(id),
  document_id UUID REFERENCES case_documents(id),
  
  -- Review data
  data_to_review JSONB NOT NULL,
  suggested_correction JSONB,
  
  -- Status
  status TEXT DEFAULT 'pending', -- pending, in_review, approved, rejected
  assigned_to UUID,
  
  -- Results
  review_decision TEXT,
  corrected_data JSONB,
  reviewer_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

-- Analytics tables
CREATE TABLE IF NOT EXISTS judges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  county_id UUID REFERENCES counties(id),
  name TEXT NOT NULL,
  total_cases INTEGER DEFAULT 0,
  family_cases INTEGER DEFAULT 0,
  custody_cases INTEGER DEFAULT 0,
  
  -- Custody outcomes
  custody_to_father INTEGER DEFAULT 0,
  custody_to_mother INTEGER DEFAULT 0,
  joint_custody INTEGER DEFAULT 0,
  
  -- Patterns (updated via analysis)
  ruling_patterns JSONB,
  frequently_cited_cases JSONB,
  
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(county_id, name)
);

CREATE TABLE IF NOT EXISTS attorneys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  
  -- Stats
  total_cases INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  
  -- Per-judge success
  judge_stats JSONB,
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cases_county ON cases(county_id);
CREATE INDEX IF NOT EXISTS idx_cases_judge ON cases(judge);
CREATE INDEX IF NOT EXISTS idx_cases_filed_date ON cases(filed_date);
CREATE INDEX IF NOT EXISTS idx_documents_case ON case_documents(case_id);
CREATE INDEX IF NOT EXISTS idx_chunks_case ON document_chunks(case_id);
CREATE INDEX IF NOT EXISTS idx_queue_status ON processing_queue(status, task_type);
CREATE INDEX IF NOT EXISTS idx_review_status ON review_queue(status, review_type);

-- Vector similarity search function
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10,
  filter_county_id UUID DEFAULT NULL,
  filter_judge TEXT DEFAULT NULL,
  filter_case_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  chunk_id UUID,
  case_id UUID,
  similarity FLOAT,
  chunk_text TEXT,
  metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.case_id,
    1 - (dc.embedding <=> query_embedding) AS similarity,
    dc.chunk_text,
    dc.metadata
  FROM document_chunks dc
  JOIN cases c ON dc.case_id = c.id
  WHERE 1 - (dc.embedding <=> query_embedding) > match_threshold
    AND (filter_county_id IS NULL OR c.county_id = filter_county_id)
    AND (filter_judge IS NULL OR c.judge = filter_judge)
    AND (filter_case_type IS NULL OR c.case_type = filter_case_type)
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;
