-- Add rows_data for rich result-table extraction (full case list + required data)
ALTER TABLE scraper_supersets
  ADD COLUMN IF NOT EXISTS rows_data JSONB;
COMMENT ON COLUMN scraper_supersets.rows_data IS 'Per-row extracted data when using rich result_table config (primaryId, rowFilter, extractColumns)';

-- If legacy "supersets" table exists (024), add same column so pipeline works with either table name
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'supersets') THEN
    ALTER TABLE supersets ADD COLUMN IF NOT EXISTS rows_data JSONB;
  END IF;
END $$;
