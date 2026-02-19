# DOM Analyzer — Web Automation Schema Generator

Watches you interact with a web page, analyzes DOM mutations, and outputs
a Playwright workflow schema that can crawl nested tables, capture data,
screenshot PDFs, and write to a database.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: RECORD                                                │
│                                                                 │
│  You browse normally in a headed browser                        │
│  observer.js is injected and silently captures:                 │
│    • Every click + the DOM mutations it caused                  │
│    • Form fills, checkbox changes, date picks                   │
│    • Tables that APPEARED after each click  ← key signal       │
│    • Aria-expanded changes, class toggles                       │
│                                                                 │
│  Output: session.json                                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│  PHASE 2: COMPILE                                               │
│                                                                 │
│  schema_compiler.py condenses the session and sends it to       │
│  Claude, which reasons about:                                   │
│    • Which clicks were expand triggers (EXPAND_TRIGGER=true)    │
│    • What the container selector is for each revealed table     │
│    • How deep the nesting goes (clicks inside expanded areas)   │
│    • What wait strategy fits each pattern                       │
│    • Whether PDFs are involved and which field holds the URL    │
│                                                                 │
│  Output: schema.json                                            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│  PHASE 3: VALIDATE                                              │
│                                                                 │
│  schema_validator.py opens the page headlessly and:            │
│    • Tests every CSS selector — counts matches                  │
│    • Simulates the first expand click, checks sub-table appears │
│    • Sends broken selectors to Claude for repair suggestions    │
│    • Annotates schema with per-selector confidence             │
│                                                                 │
│  Output: schema_validated.json                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│  PHASE 4: RUN                                                   │
│                                                                 │
│  executor.py runs the schema:                                   │
│    • Handles pagination at every nesting level                  │
│    • Recursively expands rows, captures fields                  │
│    • Opens PDFs in new tabs, scrolls+screenshots each page      │
│    • Writes to DB (Postgres or in-memory for testing)           │
│    • Collapses rows after crawling (keeps DOM clean)            │
│                                                                 │
│  OR: modal_runner.py deploys to Modal for cloud execution       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quickstart

### Install
```bash
pip install playwright anthropic asyncpg
playwright install chromium
```

### Full Pipeline (recommended)
```bash
python analyze.py pipeline https://your-portal.com --output my_workflow.json
```
This opens a browser, lets you click around, then compiles and validates automatically.

### Step by Step
```bash
# 1. Record your session
python analyze.py record https://your-portal.com --output session.json

# 2. Compile to schema
python analyze.py compile session.json --output schema.json \
  --context "The main table shows cases. Clicking a row expands it to show documents. Each document has a PDF link."

# 3. Validate selectors
python analyze.py validate schema.json

# 4. Run locally
python analyze.py run schema_validated.json --params params.json --headed

# 5. Deploy to Modal
modal deploy runtime/modal_runner.py
modal run runtime/modal_runner.py --schema-path schema_validated.json
```

---

## params.json example
```json
{
  "startDate": "2024-01-01",
  "endDate":   "2024-12-31"
}
```

## Environment variables
```bash
export ANTHROPIC_API_KEY=sk-ant-...
export DATABASE_URL=postgresql://user:pass@host/dbname
```

---

## Nested Table Patterns Supported

| Pattern | How it works |
|---------|-------------|
| Accordion row | Click row → div expands below it with sub-table |
| Modal popup | Click row → overlay modal contains table |
| Navigate away | Click link → new page, table there, go_back after |
| Literal nested table | `<td>` contains a `<table>` directly |
| XHR-loaded content | Click → API call → DOM injected async |
| Multi-level (3+ deep) | Expand → expand → expand → PDFs at leaf |

---

## Schema Reference (nested row_crawler)

```json
{
  "id": "crawl_cases",
  "type": "row_crawler",
  "rowSelector": "table#cases tbody tr",
  "capture": [
    { "field": "case_id",   "selector": "td:nth-child(1)", "attr": "text" },
    { "field": "case_name", "selector": "td:nth-child(2)", "attr": "text" }
  ],
  "expand": {
    "trigger": {
      "type": "click",
      "selector": "td.expand-btn button",
      "waitStrategy": {
        "type": "dom_mutation",
        "targetSelector": "tr.detail-row[data-case='{{case_id}}']",
        "timeout": 5000
      }
    },
    "subTable": {
      "containerSelector": "tr.detail-row[data-case='{{case_id}}'] div.docs",
      "rowSelector": "table.documents tbody tr",
      "capture": [
        { "field": "doc_id",  "selector": "td:nth-child(1)", "attr": "text" },
        { "field": "pdf_url", "selector": "td a",            "attr": "href" }
      ],
      "expand": {
        "trigger": { ... },
        "subTable": {
          "containerSelector": "...",
          "rowSelector": "...",
          "capture": [ ... ],
          "then": {
            "type": "open_pdf_and_screenshot",
            "urlField": "pdf_url",
            "screenshotDir": "./output/{{case_id}}/{{doc_id}}",
            "db": {
              "table": "documents",
              "record": {
                "case_id": "{{case_id}}",
                "doc_id":  "{{doc_id}}",
                "pdf_url": "{{pdf_url}}"
              }
            }
          }
        }
      }
    },
    "collapse": {
      "after": "subtable_crawl_complete",
      "selector": "td.expand-btn button"
    }
  },
  "pagination": {
    "nextButton": "a.next-page",
    "stopWhen":   "a.next-page.disabled",
    "resetExpandState": true
  }
}
```

---

## Files

```
dom-analyzer/
├── analyze.py                   ← Master CLI
├── analyzer/
│   ├── observer.js              ← Injected into browser (MutationObserver + click tracking)
│   └── session_recorder.py     ← Headed browser session manager
├── compiler/
│   ├── schema_compiler.py      ← LLM-powered session → schema
│   └── schema_validator.py     ← Live selector validation + repair
└── runtime/
    ├── executor.py              ← Recursive Playwright executor
    └── modal_runner.py         ← Modal cloud deployment
```
