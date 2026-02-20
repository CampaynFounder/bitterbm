# Superset quick test

How to test the superset creation → retrieval pipeline with no real target site.

## 1. Phase 1: produce a test superset file

The **Phase 1 builder** (full pattern iteration + table scrape) is not implemented yet. For testing, use the test script that writes a fixture superset JSON:

```bash
# Default: 3 ids → scraper/superset/output/test-superset.json
npx tsx scripts/superset-phase1-test.ts

# Custom count (e.g. 5 ids: test-1 … test-5)
npx tsx scripts/superset-phase1-test.ts 5

# Custom ids
npx tsx scripts/superset-phase1-test.ts --ids id1,id2,id3
```

Output: `scraper/superset/output/test-superset.json` with `{ "ids": ["test-1", "test-2", ...], "meta": { ... } }`.

## 2. Phase 2: run retrieval (API or headed)

### Option A – Admin UI

1. Go to **Admin → Superset** (`/admin/superset`).
2. In **Section 2 – Retrieval with ids**:
   - Click **Fill quick test (example.com)** to fill ids and a minimal retrieval flow that hits example.com.
   - Or upload `scraper/superset/output/test-superset.json` and paste your own retrieval flow (must start with `for_each_id`, `idsVar: "ids"`).
3. Click **Run retrieval (API)**.
4. Check the result: job id, rows stored, and logs. You should see `for_each_id: N ids` and one `store_row` per id.

The quick-test flow navigates to `https://example.com/#{{current_id}}`, waits for `h1`, extracts `page_title` from the heading, and stores a row per id (metadata goes to `scraped_cases`).

### Option B – Headed script (visible browser)

```bash
# Build a retrieval flow that starts with for_each_id (e.g. save from Admin → Scraper or use the quick-test flow), then:
npx tsx scripts/run-scraper-headed.ts path/to/retrieval-flow.json --ids-file scraper/superset/output/test-superset.json
```

## 3. What to verify

- **Executor:** Logs show `for_each_id: 2 ids (processing 2)` (or your count).
- **API:** Response has `rowsStored: 2` (or N), `jobId`, and no `error`.
- **DB:** `scraped_cases` has N new rows (e.g. `case_number` = test-1, test-2 when using quick-test; `for_each_id` sets `ctx.row.case_number` from the id).

Once this works, point your real retrieval flow at your target site and use a real superset file from the Phase 1 builder when it’s implemented.
