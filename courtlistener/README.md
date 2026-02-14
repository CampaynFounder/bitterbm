# CourtListener Integration – Georgia Alienation Cases

Fetches Georgia family court cases containing "alienation" from [CourtListener.com](https://www.courtlistener.com) and stores them in a **GA County / Judge / Date** structure for RAG (Retrieval Augmented Generation).

## Setup

1. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Get your API token**
   - Sign up at [CourtListener.com](https://www.courtlistener.com/)
   - Go to [Profile → API](https://www.courtlistener.com/profile/)
   - Copy your API token

3. **Configure**
   ```bash
   export COURTLISTENER_API_TOKEN=your_token_here
   ```

## Usage

**Basic (metadata only, ~200 cases)**
```bash
python fetch_ga_alienation.py
```

**With options**
```bash
python fetch_ga_alienation.py --max 500 --output ./rag
```

**Date range**
```bash
python fetch_ga_alienation.py --filed-after 2020-01-01 --filed-before 2024-12-31
```

**Fetch full opinion text** (slower; extra API call per case)
```bash
python fetch_ga_alienation.py --fetch-text --max 50
```

## RAG Storage Structure

```
rag/
└── GA/
    └── {county}/           # e.g. Fulton, Georgia (default)
        └── {judge}/        # e.g. Smith_J
            └── {date}/     # e.g. 2020-01-15
                ├── Case_Name_12345.json   # Full metadata + text
                └── Case_Name_12345.txt    # Plain text (if --fetch-text)
```

- **County**: Inferred from court name when possible; otherwise `"Georgia"`.
- **Judge**: From opinion `judge` or `panel_names`.
- **Date**: `dateFiled` from the opinion.

## Court Coverage

Georgia courts included:

- `gact` – Georgia Supreme Court  
- `gactapp` – Georgia Court of Appeals  

Family law opinions (custody, alienation) in Georgia are typically published by these appellate courts.

## API Limits

- 5,000 requests/hour for authenticated users.
- The script adds a 1-second delay between requests.
- [CourtListener API Docs](https://www.courtlistener.com/help/api/rest/)

## Test CourtListener Retrieval & Storage (before RAG)

To verify fetch and storage end-to-end before building RAG:

1. **Create Modal secret** (if not done):
   ```bash
   modal secret create courtlistener COURTLISTENER_API_TOKEN=your_token
   ```

2. **Fetch and store** (from project root):
   ```bash
   python3 -m modal run modal_courtlistener_test.py --action fetch --max-results 20
   ```

3. **Verify retrieval** from Modal Volume:
   ```bash
   python3 -m modal run modal_courtlistener_test.py --action verify
   ```

This stores cases in Modal Volume `courtlistener-rag` at `/data/rag/GA/` in the same County/Judge/Date structure. Once verified, you can add Supabase pgvector and RAG embeddings.

## Next Steps (RAG)

Use the stored JSON/text with:

- **pgvector** (Supabase) – Embed and search by semantic similarity  
- **LangChain / LlamaIndex** – Load documents and build a retriever  
- **Modal** – Run embedding and indexing as a serverless job  

Each document includes `metadata` (county, judge, date, case_name, court, etc.) for filtering before retrieval.
