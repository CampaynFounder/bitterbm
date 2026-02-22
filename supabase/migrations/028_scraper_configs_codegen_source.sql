-- Store raw Playwright codegen with the config (for replay and audit)
ALTER TABLE scraper_configs
  ADD COLUMN IF NOT EXISTS codegen_source TEXT DEFAULT NULL;

COMMENT ON COLUMN scraper_configs.codegen_source IS 'Raw Playwright codegen script used to generate this confi