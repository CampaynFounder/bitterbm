# Scraper Best Practices

Guidance for building court/public record scrapers that extract PDFs, text, and transcripts, linked to state, county, court, judge, attorney(s), and GAL. For sites without sophisticated scrape detection.

## Metadata Linking

Each scraped record should include:

| Field | Use | Extract with |
|-------|-----|--------------|
| `state` | State (e.g. NC, CA) – required for RAG jurisdiction filtering | extract_field or Variables (state) |
| `county` | County – required for RAG jurisdiction filtering | extract_field or Variables (county) |
| `court` | Court name | extract_field, fieldId: court |
| `judge` | Presiding judge | extract_field, fieldId: judge |
| `attorney` | Primary attorney | extract_field, fieldId: attorney |
| `attorneys` | Multiple attorneys (comma-separated or array) | extract_field, fieldId: attorneys |
| `gal` | Guardian ad litem | extract_field, fieldId: gal |
| `case_number` | Case number | extract_field, fieldId: case_number |
| `case_name` | Case name | extract_field, fieldId: case_name |
| `pdf_urls` | PDF document links | extract_pdf_url (appends to array) |
| (store to pdf_documents) | One row per PDF for RAG; state/county filterable | extract_pdf step (downloads, uploads to Supabase) |
| `text_content` | Text/transcript summary | extract_text |

## Iframes

Court sites often use iframes for navigation. Add a **Switch to iframe** step before interacting with elements inside the frame:

1. Add step: **Switch to iframe**
2. Enter the iframe selector (e.g. `iframe[name="main"]`, `iframe#content`) or frame name/URL
3. Add your click, fill, extract steps
4. Add **Switch to main page** when returning to the top-level document

Example: Cobb County mainpage loads `Main.aspx` in a frame. Add Switch to iframe (selector: `iframe[name="main"]` or URL contains `Main.aspx`), then Click `#hlCivilSearch`.

## Manual Login (Auth-Backed Pages)

For sites that require login:

1. **Use the headed script** – The API runs headless and cannot show a browser for you to log in. Run locally:

   ```bash
   npm run scraper:headed -- scraper-flow.json
   ```

2. **Flow order:**
   - `navigate` – Go to the login page
   - `pause_for_login` – Browser stays open; you log in manually
   - Continue with search/navigation steps

3. **During pause** – Log in in the visible browser, then press Enter in the terminal to continue.

4. **Environment** – Set `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` if you want rows saved to the database from the headed run.

## Anti-Detection (Sites Without Heavy Detection)

1. **Delays** – Add `delay` steps (1–3 seconds) between searches, pagination, and extractions. Avoid rapid-fire clicks.

2. **User-Agent** – Playwright uses a standard Chrome UA. The API route sets a recent Chrome UA; avoid changing it unless necessary.

3. **Viewport** – Use a normal size (e.g. 1280×720). Avoid tiny or unusual viewports.

4. **Pagination** – Use `waitAfter` on the paginate step (2+ seconds) before scraping the next page.

5. **Human-like input** – Prefer `fill` over `type` for form fields. Use `type` with `typeDelay` only when the site requires keystroke events.

6. **Session** – In headed mode, the session (cookies, storage) persists for the full run. Login once, then all subsequent steps use that session.

7. **Respect the site** – Avoid aggressive concurrency or very large date ranges. Throttle and be conservative.

## Extraction Patterns

### PDF documents

- Use `extract_pdf_url` for each PDF link (e.g. `a[href$='.pdf']`). Multiple steps or multiple links per row accumulate into `pdf_urls`.
- For PDFs on a detail page: `for_each_result` → click row → `extract_pdf_url` → `store_row`.

### Text / transcripts

- Use `extract_text` with `fieldId: text_content` or `transcript_summary`.
- Omit the selector to capture full page text, or use `.transcript-body`, `main`, etc. to scope.

### Multiple attorneys

- Extract into `attorney` (single) or `attorneys` (comma-separated string). The API converts `attorneys` to an array.

### Role-based table (e.g. Name + Represents D/P/G)

When a table has one column for name and one for role (e.g. Defendant / Plaintiff / Guardian), use **one** `for_each_result` and conditional `extract_to_memory` instead of three separate loops:

1. **Row selector** – Exclude header: `table#AttorneyGrid tbody tr:not(:first-child)` (or ensure the first data row has Represents D/P/G).
2. **Extract** – `extract_field` **Name** from `td:nth-of-type(1)` and **Represents** from `td:nth-of-type(2)`.
3. **Conditional memory** – Add three **Extract to memory** steps (source: row, key: **Name**, memoryKey: Defendant / Plaintiff / Guardian). In each step set **Only when field** = `Represents` and **equals** = `D`, `P`, or `G` respectively.
4. **Copy to row** – Use **Copy memory to row** with keys `Defendant`, `Plaintiff`, `Guardian` before **Save row**.

Result: one pass over the table; each row sets at most one of Defendant/Plaintiff/Guardian in memory.

## Modal Deployment (Production)

Validate and Run work in production when the Modal scraper is deployed:

1. **Deploy** – `modal deploy modal_scraper.py`
2. **Create secret** – `modal secret create scraper-trigger ADMIN_SECRET=your-secret ADMIN_EMAILS=you@example.com`
3. **Set env** – Add `NEXT_PUBLIC_MODAL_SCRAPER_URL` (from deploy output, e.g. `https://xxx--bitterbm-scraper-trigger-run.modal.run`) to your production env (Cloudflare, etc.)
4. **Auth** – Use X-Admin-Secret header or Bearer token (with email in ADMIN_EMAILS). The scraper UI sends whichever you configure.

## Observability & Checkpoints

Before running autonomously, validate your flow:

1. **Validate (dry run)** – Runs the full flow but does not save to the database. Returns a preview of extracted rows and logs. Use this to verify selection, filtering, and extraction before committing data.

2. **Run up to step N** – Runs only the first N steps, then stops. Use this to checkpoint: e.g. run up to step 5 to confirm the search form and result list work before adding extraction steps.

3. **Logs** – The result panel shows logs including:
   - `for_each_result: found N rows`
   - `extract_field fieldId: value`
   - `store_row: saving field1, field2, ...`
   - Page URL when stopped

4. **Preview rows** – Dry run returns the exact data that would be stored. Inspect to ensure field mapping is correct.

## Simple Flows (flat PDF lists)

For sites without nested tables:

1. `navigate` → `fill_field` / `select_dropdown` → `click` → `wait`
2. `for_each_result` over rows:
   - `condition_group` – filter by case_type, doc_type, etc.
   - `extract_field` – case_number, state, county (or use Variables)
   - `extract_pdf_url` or `extract_pdf` – get PDF URL
   - `extract_pdf` – download, upload to Supabase, store in pdf_documents (state/county for RAG)
   - `store_row` – optional, for scraped_cases
3. `paginate` – next page

Set **state** and **county** in Variables (or extract from page) for RAG jurisdiction filtering.

## Memory and deduplication

### What gets kept in memory

- **Variables** (e.g. state, county) are available to every step and are merged into the row when you use **Copy memory to row**.
- Use **Extract to memory** to copy a value from the current row (or from vars) into a named memory key. You can use multiple **Extract to memory** steps at different points in the flow to add or overwrite keys (e.g. state, county, case_number).
- Before **Save row to database**, add **Copy memory to row** and list the memory keys to copy into the row. The saved row will include those keys (and anything already in the row from extract_field, etc.).

Example: early in the loop extract `case_number` into memory; later extract `state`/`county` from vars into memory; then **Copy memory to row** with keys `state`, `county`, `case_number`; then **Save row**.

### Avoiding duplicate cases

Configure **Deduplication: unique case key columns** in the Flow section (e.g. `state, county, case_number` or `state, county, court, case_number`). Column names must match the keys that will be in the row when saving (same names as in memory or extract_field).

- Before inserting into `scraped_cases`, the runner checks if a row already exists with the same values for those columns.
- If it exists, the row is skipped and a log line is added: `store_row: skipped duplicate (state, county, case_number)`.
- Use the same combination that uniquely identifies a case in your jurisdiction (state + county + court + case_number, or state + county + case_number if court is not needed).

## Typical Flow

1. `navigate` – Search page (or login page)
2. `pause_for_login` – If auth required (headed run only)
3. `fill_field` / `select_dropdown` / `date_range` – Search form
4. `click` – Submit
5. `wait` – Wait for results
6. `for_each_result` – For each result row:
   - `extract_field` – state, county, court, judge, case_number, etc.
   - `extract_field` – attorney(s), gal
   - `extract_pdf_url` – PDF links (repeat per link type)
   - `extract_text` – If transcript on row
   - `store_row`
7. `paginate` – Next page (loop back to step 5)
8. `delay` – Throttle between pages
