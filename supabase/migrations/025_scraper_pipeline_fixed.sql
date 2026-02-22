-- Data Pipeline Schema for County Court Scrapers
-- This is separate from the existing CourtListener pipeline
-- Uses unique table names to avoid conflicts

-- Enable vector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Court Systems/Counties being scraped
CREATE TABLE IF NOT EXISTS scraper_counties (
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
  county_id UUID REFERENCES scraper_counties(id) ON DELETE CASCADE,
  version INTEGER DEFAULT 1,
  
  -- Navigation config
  navigation_steps JSONB NOT NULL,
  
  -- Search form config
  search_form JSONB,
  
  -- Results table config
  results_table JSONB,
  
  -- Case detail config
  case_detail JSONB,
  
  -- Extraction rules
  extraction_rules JSONB NOT NULL,
  
  -- Validation status
  is_validated BOOLEAN DEFAULT FALSE,
  validated_at TIMESTAMPTZ,
  validated_by UUID,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Supersets (Search result batches)
CREATE TABLE IF NOT EXISTS scraper_supersets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  county_id UUID REFERENCES scraper_counties(id) ON DELETE CASCADE,
  name TEXT,
  
  -- Search criteria used
  search_params JSONB NOT NULL,
  
  -- Results
  case_ids JSONB,
  total_cases INTEGER DEFAULT 0,
  
  -- Processing status
  status TEXT DEFAULT 'pending', -- pending, collecting, processing, complete, failed
  progress INTEGER DEFAULT 0, -- 0-100
  
  -- Errors
  error_log JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scraped Cases (Extracted data from county courts)
CREATE TABLE IF NOT EXISTS scraped_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  county_id UUID REFERENCES scraper_counties(id),
  superset_id UUID REFERENCES scraper_supersets(id),
  
  -- Identifiers
  case_number TEXT NOT NULL,
  external_case_id TEXT,
  
  -- Case info
  case_type TEXT,
  case_status TEXT,
  filed_date DATE,
  closed_date DATE,
  
  -- Parties (parsed from text)
  plaintiff TEXT,
  defendant TEXT,
  all_parties JSONB,
  
  -- Court
  judge TEXT,
  court_division TEXT,
  
  -- Outcome
  outcome TEXT,
  outcome_summary TEXT,
  
  -- Raw data
  raw_data JSONB,
  
  -- Processing
  extraction_status TEXT DEFAULT 'pending',
  needs_review BOOLEAN DEFAULT FALSE,
  review_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(county_id, case_number)
);

-- Scraped Documents (PDFs, orders, etc.)
CREATE TABLE IF NOT EXISTS scraped_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES scraped_cases(id) ON DELETE CASCADE,
  
  -- Document info
  document_type TEXT,
  document_title TEXT,
  filed_date DATE,
  
  -- Storage
  source_url TEXT,
  storage_path TEXT,
  file_size_bytes BIGINT,
  page_count INTEGER,
  
  -- Extraction
  extracted_text TEXT,
  extraction_method TEXT,
  extraction_quality FLOAT,
  
  -- Processing
  status TEXT DEFAULT 'pending',
  needs_review BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scraped Document Chunks (for RAG)
CREATE TABLE IF NOT EXISTS scraped_doc_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES scraped_documents(id) ON DELETE CASCADE,
  case_id UUID REFERENCES scraped_cases(id) ON DELETE CASCADE,
  
  -- Chunk data
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  page_number INTEGER,
  
  -- Embeddings
  embedding VECTOR(1536),
  
  -- Metadata for filtering
  metadata JSONB NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(document_id, chunk_index)
);

-- Scraper Processing Queue
CREATE TABLE IF NOT EXISTS scraper_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Task info
  task_type TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  
  -- References
  county_id UUID REFERENCES scraper_counties(id),
  superset_id UUID REFERENCES scraper_supersets(id),
  case_id UUID REFERENCES scraped_cases(id),
  document_id UUID REFERENCES scraped_documents(id),
  
  -- Task data
  task_data JSONB,
  
  -- Status
  status TEXT DEFAULT 'queued',
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

-- Scraper Review Queue (Human in the loop)
CREATE TABLE IF NOT EXISTS scraper_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What needs review
  review_type TEXT NOT NULL,
  
  -- References
  county_id UUID REFERENCES scraper_counties(id),
  case_id UUID REFERENCES scraped_cases(id),
  document_id UUID REFERENCES scraped_documents(id),
  
  -- Review data
  data_to_review JSONB NOT NULL,
  suggested_correction JSONB,
  
  -- Status
  status TEXT DEFAULT 'pending',
  assigned_to UUID,
  
  -- Results
  review_decision TEXT,
  corrected_data JSONB,
  reviewer_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

-- Judge Analytics
CREATE TABLE IF NOT EXISTS scraper_judges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  county_id UUID REFERENCES scraper_counties(id),
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

-- Attorney Analytics
CREATE TABLE IF NOT EXISTS scraper_attorneys (
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
CREATE INDEX IF NOT EXISTS idx_scraped_cases_county ON scraped_cases(county_id);
CREATE INDEX IF NOT EXISTS idx_scraped_cases_judge ON scraped_cases(judge);
CREATE INDEX IF NOT EXISTS idx_scraped_cases_filed_date ON scraped_cases(filed_date);
CREATE INDEX IF NOT EXISTS idx_scraped_documents_case ON scraped_documents(case_id);
CREATE INDEX IF NOT EXISTS idx_scraped_doc_chunks_case ON scraped_doc_chunks(case_id);
CREATE INDEX IF NOT EXISTS idx_scraper_queue_status ON scraper_queue(status, task_type);
CREATE INDEX IF NOT EXISTS idx_scraper_review_status ON scraper_review_queue(status, review_type);

-- Vector similarity search function
CREATE OR REPLACE FUNCTION match_scraped_documents(
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
  FROM scraped_doc_chunks dc
  JOIN scraped_cases c ON dc.case_id = c.id
  WHERE 1 - (dc.embedding <=> query_embedding) > match_threshold
    AND (filter_county_id IS NULL OR c.county_id = filter_county_id)
    AND (filter_judge IS NULL OR c.judge = filter_judge)
    AND (filter_case_type IS NULL OR c.case_type = filter_case_type)
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- RLS Policies (optional - enable if needed)
-- ALTER TABLE scraper_counties ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE scraped_cases ENABLE ROW LEVEL SECURITY;
-- etc.
