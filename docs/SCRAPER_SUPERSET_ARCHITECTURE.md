# Two-Phase Scraper: Superset Builder + Record Retrieval

This doc captures the architecture, pseudo-logic, and open questions for a **superset builder** (Phase 1) that produces lists of record identifiers, and a **record retrieval** (Phase 2) script that uses those lists to navigate to each record and collect data/screenshots for the RAG pipeline. It is intended for a **separate admin / approach** from the current autoscrape flow.

---

## 1. Restated architecture (confirmation of pseudo-logic)

### Phase 1: Superset builder

**Input (hyperparameters)**

- **Search text patterns** – e.g. `A%A%A%`, `A%A%B%` (or other pattern schemes the site supports).
- **Result-set filters** – date range, checkboxes, dropdowns (and any other form fields that narrow results).
- **Threshold** – minimum number of `<tr>` with a given “signature” (combination of `<td>` values) to consider that result set worth storing.
- **Table/row semantics** – CSS selectors for:
  - The table (or container) that holds the result rows.
  - The `<tr>` elements (including rows that are “paginated” in the UI but already present in the DOM).
  - Optional: which `<td>` values define the “signature” and which contain the **primary identifier** (e.g. case number, document id) used later for navigation.

**Logic (high level)**

1. **Iteration over search space**  
   For each combination of hyperparameters (e.g. each pattern × date range × checkbox/dropdown combo):
   - Navigate to the search page (with auth if required).
   - Fill the form (pattern, dates, checkboxes, dropdowns) and submit (or trigger search).
   - Wait for the table to be populated (the key assumption: **all** result `<tr>` are present in the DOM even if the UI shows only one “page”).
2. **Result set analysis**  
   - Query all `<tr>` matching the configured row selector (e.g. `table tbody tr`).
   - Group or filter rows by a “signature” (e.g. combination of specific `<td>` values or attributes).
   - For each signature (or for the whole set) count rows.
3. **Threshold and storage**  
   - If count > configured threshold (or other condition):
     - Store for this superset:
       - The **search parameters** used (pattern, date range, checkboxes, dropdowns).
       - **CSS selectors** (table, row, and optionally cells for signature and primary id).
       - **Unique identifiers** for each `<tr>` (e.g. primary id from a `<td>` or from a link).
   - Append to a superset list (superset 1, 2, … n), or create one file/list per “batch” of search params.
4. **Output**  
   - One or more **superset files** (e.g. JSON/CSV) containing:
     - Search params + selectors + metadata for reproducibility.
     - List of **primary identifiers** (and optionally signature or row metadata) to be consumed by Phase 2.

### Phase 2: Record retrieval

**Input**

- Superset file(s) from Phase 1 (or a subset), i.e. list of primary identifiers (and optionally context such as which search params produced them).

**Logic**

- For each primary identifier:
  - Navigate to the record (e.g. construct URL from id, or open search page and use id to open detail – same pattern as current autoscrape “navigate then click/extract”).
  - Run a **predefined script** (fixed steps): e.g. wait for content, extract fields, take screenshots, open PDFs and store them, etc.
- Persist extracted data and screenshots to the DB for the RAG pipeline (existing `pdf_documents` / storage patterns).

**Separation of duties**

- **Phase 1** = no per-record screenshots or heavy extraction; it only discovers and lists “which records” (and under which search params).
- **Phase 2** = no search iteration; it only takes a list of ids and runs the same flow per record.

---

## 2. Decisions (from user)

- **Pagination:** Assume **all results in DOM** for now. Design so we can add a second mode later (e.g. __doPostBack Page$N or “load more” clicks) with **backward compatibility**; no VLM/screenshot analysis for now.
- **Pattern iteration:** Config supplies **wildcard character** (if any), **min non-wildcard characters**, and **case sensitivity**. Engine **generates** combinations (e.g. AAA, AAB, AAC … or A%A%A, A%A%B using wildcard) and iterates with date range and dropdown traversal. Threshold = min rows to keep that combination.
- **Primary id:** Always from **one column** (or sometimes from a link in that column). **Dedupe by id** for a given site across supersets.
- **Login:** **Separate script** from superset creation and data collection. Login runs first (optional); superset builder and retrieval assume an existing session (cookies/storage) or no auth.
- **Iframe:** On the result page there is a **single iframe** containing search form + table. May or may not be the same iframe as on the auth page; treat result page as “one iframe” for selectors.
- **Phase 2 input:** Accept **JSON or CSV** superset file, or **one or more ids** directly (e.g. random sample). Whatever format is easiest to produce and consume.
- **Superset storage:** **Local files** for now; move to web/storage once the pipeline is validated.
- **Supervision:** **Human-in-the-loop** for Phase 1 (and Phase 2 for now); human triggers runs and verifies before scaling.

---

## 3. Clarifying questions (reference; most answered above)

### 3.1 DOM / pagination assumption

- **Confirm:** On your target sites, after a single “search” (form submit or equivalent), the DOM actually contains **all** result `<tr>` for that query, and “pagination” is only UI (e.g. hiding rows with CSS or showing a slice)? Or do some sites load more rows only when the user clicks “next page” (e.g. new network request)?
- **If mixed:** Should we support both modes (1) “all rows in DOM” and (2) “must click through pages and aggregate rows” and make it configurable per site?

### 3.2 Search space and iteration

- **Patterns:** Are `A%A%A%`, `A%A%B%` literal search strings the site accepts (e.g. wildcard search), or do you want the engine to **generate** combinations (e.g. all 3-letter prefixes, or from a configurable alphabet)?
- **Combinatorics:** Should we limit iteration (e.g. max combinations per run, or “first N that meet threshold”) to avoid runaway runs?
- **Idempotence:** If we re-run Phase 1 with the same hyperparameters, should we **merge** new ids into existing superset files or **replace** by superset key (e.g. by search-param hash)?

### 3.3 “Signature” and threshold

- **Signature:** Is the “combination of values for `<td>`”:
  - A fixed set of columns (e.g. “case type + status + judge”), or
  - Configurable per deployment (e.g. list of column names or selectors)?
- **Threshold:** One global “min rows” per signature, or per-signature rules (e.g. “if signature = X then threshold 10, else 50”)?

### 3.4 Primary identifier

- **Source:** Is the primary id always from a specific column (e.g. case number), or sometimes from a link `href` or `data-id`? Should this be configurable (selector + attribute)?
- **Uniqueness:** Can the same record appear in multiple result sets (different search params)? If yes, should Phase 1 **deduplicate** by primary id before writing superset files so Phase 2 doesn’t hit the same record twice?

### 3.5 Auth and session

- **When auth is required:** Should Phase 1 and Phase 2 share a single “login flow” (e.g. one script that logs in once, then Phase 1 runs, then Phase 2 runs in the same session), or do you want Phase 1 and Phase 2 to be **fully separate scripts** that each handle their own login (e.g. reuse a saved auth state or cookie store)?
- **Session lifetime:** For long-running Phase 1 (many combinations), do we need “re-login on session expiry” logic?

### 3.6 Iframe and “search criteria that populate a table”

- **Confirm:** The flow is: main page (or top frame) has the search form; the table with expandable rows and nested tables is inside an **iframe**; after submit, the iframe content updates and contains the full `<tr>` list?
- **Target:** Should the superset builder always “switch into” a specific iframe (by name/selector/url) before reading the table, and is that iframe selector part of the hyperparameters/config?

### 3.7 Output format and consumption

- **Format:** Prefer superset output as JSON (e.g. `{ "searchParams": {...}, "selectors": {...}, "rows": [ { "id": "...", "signature": [...] } ] }`), CSV, or both?
- **Phase 2 input:** Should Phase 2 accept only a list of ids, or the full superset file (and optionally filter by signature or search params)?

---

## 4. Architecture review and recommendations

### 4.1 Configurability

- **Config file per site (or per “campaign”):** One JSON/YAML that defines:
  - Search form: fields (pattern, date range, checkboxes, dropdowns), selectors, and how to iterate (e.g. list of pattern strings, or date steps).
  - Table: table selector, row selector, signature columns, primary-id column/selector.
  - Threshold(s) and any per-signature rules.
  - Iframe: selector or name if the table is in an iframe.
- **Separation:** Keep “site-agnostic engine” (iterate → fill → read table → threshold → write) and “site-specific config” (selectors, field names, pattern lists). That makes it easier to add new courts/sites without changing code.

### 4.2 Performance

- **Throttling:** Optional delay between search submissions (e.g. 1–2 s) to avoid overloading the server or triggering blocks.
- **Parallelism:** Phase 2 can run multiple browser contexts or workers in parallel (each taking a slice of the id list), with a configurable concurrency limit.
- **Resumability:** Phase 1: persist “last run search-param index” so a failed run can resume. Phase 2: track “last processed id” or a checkpoint file so retrieval can resume.

### 4.3 Authentication

- **Reuse existing pattern:** Use the same “pause for login” or “inject cookies / storage” approach as the current headed flow when running locally.
- **Headless / Cloudflare:** For Cloudflare Workers (or Pages), browser automation is not available in the same way; you’d typically:
  - Run Playwright in a **separate environment** (e.g. Modal, a long-running worker with a browser, or a queue that triggers a browser service) that is **called** by the Cloudflare page (e.g. “start superset build”, “start retrieval for these ids”).
- **Recommendation:** Keep Phase 1 and Phase 2 as **Playwright scripts** (or Modal/Node) that can be triggered and supervised from a Cloudflare **admin UI** (e.g. “Run superset build”, “Run retrieval”), with auth handled in the browser run (login once, then run phases), rather than implementing the heavy lifting inside the Worker itself.

### 4.4 Known web patterns and preconditions

Documenting **preconditions** makes it clear when and why a site might need custom logic:

- **All rows in DOM:** The superset builder assumes the result table is fully rendered in the DOM after one search. If the site uses “virtual” or lazy-loaded rows (only N rows in DOM, rest loaded on scroll/page), the current design must be extended (e.g. “scroll to load all” or “click next page and aggregate”).
- **Table in iframe:** The engine must switch to the correct frame before querying the table; the config must specify the iframe (and optionally wait for it to load).
- **Expandable rows:** If “expand” is required to get the primary id or signature, the config can define an “expand” step (e.g. click first cell or a “+” control) and then read `<tr>`; the engine can optionally expand all before counting, or only expand when storing ids.
- **No anti-bot / blocking:** Sites that block headless browsers or require CAPTCHA need either a headed run (local or with a visible browser service) or a different strategy; the doc should state that the approach assumes “public or public-behind-auth and no prohibition on scraping.”

### 4.5 Where modifications are needed (analysis)

- **Site analysis checklist:** A short “compatibility” checklist per site can help:
  - Is the result set fully in DOM after one search? (Y/N)
  - Is the table in an iframe? (selector/name)
  - Where is the primary id? (column index, link href, data attribute)
  - Does the search form use GET, POST, or XHR? (affects how we iterate and replay)
- This can live in the same config file or a separate “site notes” doc so that when something breaks, we know which of these assumptions to re-check.

---

## 5. Technical and functional requirements (potential gaps)

### 5.1 Technical

- **Browser environment:** Phase 1 and Phase 2 run in a real browser (Playwright). For “Cloudflare page that navigates and does analysis,” the actual navigation and DOM access must run in a browser service; the Cloudflare page orchestrates (e.g. “start job,” “poll status,” “download superset file”).
- **Storage for superset files:** Where are superset files stored? Options: local disk (for local runs), Supabase Storage (or similar) for Cloudflare/orchestrator to fetch, or DB table (e.g. “superset_runs” with a blob or reference to storage). Need a decision for Phase 2 to “load the list” in a remote setup.
- **Id format and URL construction:** Phase 2 must know how to go from “primary id” to “URL or action” (e.g. base URL + id, or “search page + click row by id”). This mapping should be configurable (e.g. template URL or “use selector that matches id”).
- **Error handling:** Per-search failure (e.g. timeout, captcha) vs per-row failure in Phase 2. Retries, skip vs abort, and logging (which search params or which id failed).

### 5.2 Functional

- **Supervised automation:** You want “supervised yet automated.” Do you mean: (a) human triggers each run (e.g. “Build superset” / “Run retrieval” buttons) and can pause/cancel, or (b) automated on a schedule but with alerts/review when threshold or errors exceed a limit? Both can be supported; clarify for the first version.
- **Visibility:** For Phase 1, do you need a UI that shows “current search params,” “rows found,” “supersets created so far,” and maybe a preview of the first few ids? That would favor an admin page that starts the job and shows live or recent status.
- **Re-run and overwrite:** When re-running Phase 1 with the same config, should we create a new superset file (e.g. with timestamp) or overwrite by name? When re-running Phase 2, should we skip records already in the DB (e.g. by case_number) to support incremental runs?

### 5.3 Security and compliance

- **Secrets:** Auth credentials or session cookies must not be stored in the config in plain text; use env vars or a secrets store, and document that.
- **Rate limiting and robots.txt:** Document that implementers should respect the site’s robots.txt and use reasonable delays; the architecture should support configurable delays.

---

## 6. Implementation plan (config + scripts)

### 6.1 Script roles (three separate scripts)

| Script | Purpose | Input | Output |
|--------|---------|--------|--------|
| **Login** | Authenticate once; save session (cookies/storage) for reuse. | Config: login URL, selectors, credentials (from env). | Persisted session (e.g. browser state or cookies file). |
| **Superset builder (Phase 1)** | Iterate search space; count rows; emit ids above threshold; dedupe by id. | Site config (see below) + optional saved session. | Local superset file(s) (JSON/CSV): search params + list of primary ids. |
| **Record retrieval (Phase 2)** | For each id, navigate to record and run predefined steps (extract, screenshots, PDFs). | Superset file (JSON/CSV) **or** inline list of ids (e.g. random sample). Optional saved session. | DB (pdf_documents, etc.) and local artifacts as today. |

Login is **independent**: run it when needed; superset and retrieval assume the browser (or a loaded session) is already logged in, or that the site is public.

### 6.2 Site config schema (for superset builder)

Config is JSON (one per site/campaign). Structure below is backward-compatible so we can add pagination mode later.

```json
{
  "siteId": "cobb-superior",
  "description": "Cobb County Superior Court search",
  "baseUrl": "https://...",
  "iframe": {
    "selector": "iframe#content",
    "urlContains": "WebCaseManagement"
  },
  "searchForm": {
    "patternField": { "selector": "#tbPersonSearch", "type": "text" },
    "wildcard": "%",
    "minNonWildcardChars": 1,
    "caseSensitive": false,
    "dateRange": {
      "fromSelector": "#fromDate",
      "toSelector": "#toDate",
      "fromValue": "2024-01-01",
      "toValue": "2024-12-31"
    },
    "checkboxes": [
      { "selector": "#cblCivilCourtTypes_0", "checked": true }
    ],
    "dropdowns": [
      { "selector": "#ddlCaseType", "value": "CV" }
    ],
    "submitSelector": "#btnSearch"
  },
  "patternGeneration": {
    "alphabet": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "length": 3,
    "useWildcard": true,
    "wildcardChar": "%"
  },
  "resultTable": {
    "tableSelector": "table#gvResults",
    "rowSelector": "tbody tr",
    "columnNames": ["Case #", "Status", "Case Type"],
    "primaryId": {
      "source": "column",
      "columnIndex": 0,
      "linkSelector": "a",
      "linkAttribute": "href",
      "textSelector": null
    },
    "signatureColumns": [0, 1, 2],
    "threshold": 5,
    "rowFilterLogic": "and",
    "rowFilter": [
      { "columnIndex": 1, "operator": "equals", "value": "Active", "not": false },
      { "columnIndex": 2, "operator": "in", "value": ["CV", "CR"], "not": false }
    ],
    "extractColumns": [
      { "columnIndex": 0, "outputKey": "caseNumber" },
      { "columnIndex": 1, "outputKey": "status" }
    ]
  },
  "pagination": {
    "mode": "all_in_dom",
    "rowSelector": "tbody tr"
  }
}
```

- **pagination.mode:** `"all_in_dom"` for current behavior. Later: e.g. `"postback"` with `nextLinkPattern: "Page$N"` or `"click_next"` with `nextButtonSelector` so we can add multi-page aggregation without breaking existing configs.
- **primaryId:** If `source` is `"link"`, use `linkSelector` + `linkAttribute` inside the cell; else use cell text. Dedupe by this id across all supersets for this site.
- **resultTable.rowFilter (optional):** Array of filters. Only rows that satisfy **all** filters are included. Each filter: `columnIndex` (0-based: 0 = first column, 1 = second, etc.), `operator` `"equals"` (cell text equals `value`) or `"in"` (cell text is one of the strings in `value` array). Phase 1 applies: find table → query rows by `rowSelector` → for each row, check each filter on the nth child/cell → keep row only if all match → extract primary id (and optionally other values) from kept rows. Stored output = search criteria + list of unique ids (and optionally other column values).
- **Table and unique ID logic (summary):** The **table** is located by `tableSelector`; **rows** are all elements matching `rowSelector` (e.g. `tbody tr`). Optionally **rowFilter** restricts to “rows where nth column equals X” or “nth column in [A, B, C]”. **Unique ID** per row comes from `primaryId`: either the text (or link attribute) of the cell at `columnIndex`, or the attribute of the link matching `linkSelector` in that cell. Phase 1 stores **search criteria** (pattern, dates, etc.) and the **list of unique ids** (and optionally other values) from the filtered rows.
- Pattern generation: build combinations from `alphabet` with `length`; if `useWildcard` then insert `wildcardChar` per config (e.g. A%A%A). Respect `caseSensitive` when comparing.

### 6.3 Superset output format (Phase 1 → Phase 2)

**JSON (easiest for programmatic use):**

```json
{
  "siteId": "cobb-superior",
  "generatedAt": "2024-01-15T12:00:00Z",
  "searchConfigSnapshot": { ... },
  "ids": ["id1", "id2", "..."],
  "bySignature": { "sig1": ["id1", "id2"], "sig2": ["id3"] }
}
```

Phase 2 can accept: (a) path to this file, (b) raw array of ids, or (c) path + optional filter (e.g. random sample of size N). CSV variant: one column `id`, optional columns for signature/search params.

### 6.4 Backward compatibility for pagination

- Keep **resultTable.rowSelector** as the single source of “rows to count.” For `all_in_dom`, query once inside the iframe. For a future `postback` or `click_next` mode, the engine will:
  - Loop: submit search or click next; wait for new rows; query **rowSelector**; append to a running list; stop when no new page or max pages.
  - Then apply the same threshold/signature logic on the aggregated list. So threshold, primaryId, and signature config stay the same; only the “how we get the list of tr” changes.

### 6.5 File layout (suggested)

```
scraper/
  superset/
    config/
      cobb-superior.json
    login.py          # or login.ts – loads config, runs login flow, saves session
    phase1_build.py   # superset builder: load config + optional session, output local JSON/CSV
    phase2_retrieve.py # load superset file or ids, run retrieval flow per id
    output/           # local superset files (gitignore)
      cobb-superior_superset_20240115.json
```

---

## 7. Suggested next steps

1. **Implement** the three scripts under `scraper/superset/`: login, phase1_build (superset builder), phase2_retrieve (record retrieval), using the config schema in §6.2 and output format in §6.3.
2. **Add** a sample site config (e.g. `config/cobb-superior.json`) and wire pattern generation (alphabet, length, wildcard, case sensitivity) and dedupe by primary id.
3. **Keep** pagination as `all_in_dom` only; document the extension point for `postback` / `click_next` when needed.
4. **Add an admin page** (separate from current autoscrape) to “try this approach”: upload or point to config, trigger superset build, download superset file, trigger retrieval (with optional id filter or random sample), and show status/logs. Human-in-the-loop for Phase 1 (and Phase 2) for now.
5. **Later:** Move superset file storage to web (e.g. Supabase Storage) when the pipeline is validated for automation.
