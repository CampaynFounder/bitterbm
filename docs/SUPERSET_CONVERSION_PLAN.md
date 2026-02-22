# Superset conversion: rich result config → pipeline

**Goal:** Use the same result-table logic as the Superset UI (row filters, nested filters, extract columns) when creating supersets from the **converted codegen config**, so we get the full list of cases and required data without running Phase 1 locally.

**Scope (first):** Superset creation only. Extraction (PDF/case detail) stays as-is; we give it case IDs and paths.

---

## Current state

| Piece | Behavior |
|-------|----------|
| **Codegen → convert** | Produces `navigation_steps` + minimal `results_table` (table_selector, row_selector) + `extraction_rules`. Saved to `scraper_configs`. |
| **Pipeline `_run_search_collect_ids`** | Uses `scraper_config['extraction_rules']['results_table']` with `row_selector` + `case_id_selector`; simple loop over all rows, no filters. |
| **Phase 1 (local)** | Uses flow + siteConfig with **rich** resultTable (primaryId, rowFilter, nestedRowFilters, nestedTableChecks, extractColumns). One search → filter/extract rows → output ids + rows. |

**Gap:** Pipeline never sees the rich result config; DB stores `results_table` at top level but pipeline reads `extraction_rules['results_table']`. Rich config is only used when running Phase 1 locally.

---

## What it takes

### 1. Config resolution (pipeline)

- Resolve result table from: `scraper_config.get('results_table') or (scraper_config.get('extraction_rules') or {}).get('results_table')`.
- Treat as **legacy** if it has `row_selector` + `case_id_selector` (keep current simple loop).
- Treat as **rich** if it has `primaryId` (and typically `tableSelector`, `rowSelector`). Use new extraction path.

### 2. Shared async result-table extraction

- Add **`scraper/superset/result_table_extract.py`** (or similar) with **async** versions of Phase 1’s row logic:
  - Row filters (columnIndex, operator, value, and/or, not).
  - Nested row filters (selectorWithinRow, exists/not_exists, includeParentWhen).
  - Optional: nested table checks (exists; expand/collapse can come later).
  - primaryId (column or link) + extractColumns.
- Entry point: e.g. `async def extract_from_result_table(page, root, result_table_config, vars_dict, log) -> Tuple[List[str], List[dict]]` returning `(ids, rows_data)`.

### 3. Pipeline: use rich extraction in `_run_search_collect_ids`

- After running nav steps, get “root” (page or frame) from `results_table.iframe` or step context.
- If config is **legacy**: keep existing loop (row_selector + case_id_selector).
- If config is **rich**: call shared `extract_from_result_table` and use returned `(ids, rows_data)`.
- Return `case_ids` (and optionally pass `rows_data` up so superset record can store it).

### 4. Persist full row data (optional but recommended)

- Add **`rows_data JSONB`** to `scraper_supersets` (migration).
- When using rich extraction, write `rows_data` in the same update that sets `case_ids` / `total_cases`, so the superset has “cases and required data” in one place.

### 5. UI: edit result table after codegen

- On **Codegen** page (or Configure Scraper): after convert, allow editing **result table** (primaryId, rowFilter, nestedRowFilters, extractColumns) using the same schema as the Superset UI.
- Save into `scraper_configs.results_table` (overwriting or merging the converter’s minimal blob). Options:
  - **A)** Inline “Edit result table” form on the codegen/config page.
  - **B)** “Load result config” from a saved Superset result config (e.g. from `scraper_flows` / superset_result_config) and set as `results_table` for this county.

Doing (5) makes the “modify the conversion output” path real: converter gives a baseline; user (or saved preset) adds filters and columns; pipeline uses that for superset creation.

---

## Step / table name alignment

- Pipeline’s **nav steps** are converter format: `type` (navigate, fill, click, …), flat. Keep using `_execute_step` for those.
- **Result table** is the only thing we’re making “rich”; step format stays as-is.
- **Supersets table:** App uses both `supersets` and `scraper_supersets` in places. Prefer one name and use it consistently in pipeline and API (e.g. `scraper_supersets` per migration 026).

---

## Order of work

1. ~~Add shared **async result-table extraction** module and **is_rich_result_config** helper.~~ ✅ `scraper/superset/result_table_extract.py`
2. ~~In pipeline: **resolve** `results_table` from config; **branch** legacy vs rich; call shared extractor when rich.~~ ✅ `_run_search_collect_ids` updated
3. ~~(Optional) Migration + pipeline update to **persist `rows_data`** on superset.~~ ✅ Migration `029_scraper_supersets_rows_data.sql`; pipeline returns and stores `rows_data`
4. (Optional) **Codegen/Admin UI**: edit or load result table config and save to `scraper_configs.results_table`. (Not yet implemented.)

After (1)–(3), superset creation uses rich result config when present and persists full row data. (4) gives a UI to “modify the conversion output” without editing JSON by hand.
