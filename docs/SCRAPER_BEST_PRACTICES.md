# Scraper Best Practices

Guidance for building court/public record scrapers that extract PDFs, text, and transcripts, linked to state, county, court, judge, attorney(s), and GAL. For sites without sophisticated scrape detection.

## Metadata Linking

Each scraped record should include:

| Field | Use | Extract with |
|-------|-----|--------------|
| `state` | State (e.g. NC, CA) | extract_field, fieldId: state |
| `county` | County | extract_field, fieldId: county |
| `court` | Court name | extract_field, fieldId: court |
| `judge` | Presiding judge | extract_field, fieldId: judge |
| `attorney` | Primary attorney | extract_field, fieldId: attorney |
| `attorneys` | Multiple attorneys (comma-separated or array) | extract_field, fieldId: attorneys |
| `gal` | Guardian ad litem | extract_field, fieldId: gal |
| `case_number` | Case number | extract_field, fieldId: case_number |
| `case_name` | Case name | extract_field, fieldId: case_name |
| `pdf_urls` | PDF document links | extract_pdf_url (appends to array) |
| `text_content` | Text/transcript summary | extract_text |

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
