-- Execution UI: recorder tracking and separate superset vs extraction configs
-- Run after 026_scraper_pipeline_clean.sql

-- Recorder existence tracking per county (for Execution UI checklist)
ALTER TABLE scraper_counties
  ADD COLUMN IF NOT EXISTS superset_recording_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS extraction_recording_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN scraper_counties.superset_recording_at IS 'When superset codegen recording was last uploaded or marked present (Execution UI)';
COMMENT ON COLUMN scraper_counties.extraction_recording_at IS 'When extraction codegen recording was last uploaded or marked present (Execution UI)';

-- Config type: one county can have separate superset config and extraction config
ALTER TABLE scraper_configs
  ADD COLUMN IF NOT EXISTS config_type TEXT DEFAULT 'extraction';

-- Backfill existing rows so unique constraint applies
UPDATE scraper_configs SET config_type = 'extraction' WHERE config_type IS NULL;

ALTER TABLE scraper_configs ALTER COLUMN config_type SET NOT NULL;

-- One superset + one extraction config per county
CREATE UNIQUE INDEX IF NOT EXISTS idx_scraper_configs_county_type
  ON scraper_configs (county_id, config_type);

COMMENT ON COLUMN scraper_configs.config_type IS 'superset = search/case list config; extraction = case-detail + PDF extraction config';
