# End-to-End Testing Checklist

Complete this checklist before committing the data pipeline system.

---

## ✅ Automated Tests

Run the automated test script:

```bash
./test-pipeline.sh
```

This checks:
- [ ] Environment setup
- [ ] Dependencies installed
- [ ] Python syntax
- [ ] TypeScript compilation
- [ ] File structure
- [ ] Documentation exists

---

## 🗄️ Database Migration (Manual)

### Step 1: Run Migration

1. [ ] Open Supabase Dashboard (https://supabase.com/dashboard)
2. [ ] Navigate to SQL Editor
3. [ ] Copy contents of `supabase/migrations/026_scraper_pipeline_clean.sql`
4. [ ] Paste into new query
5. [ ] Click "Run"
6. [ ] Verify success message

### Step 2: Verify Tables Created

Run this query in SQL Editor:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND (table_name LIKE 'scraper%' OR table_name LIKE 'scraped%')
ORDER BY table_name;
```

Should return **10 tables**:
- [ ] scraped_cases
- [ ] scraped_doc_chunks
- [ ] scraped_documents
- [ ] scraper_attorneys
- [ ] scraper_configs
- [ ] scraper_counties
- [ ] scraper_judges
- [ ] scraper_queue
- [ ] scraper_review_queue
- [ ] scraper_supersets

### Step 3: Test Sample Insert

Try inserting a test county:

```sql
INSERT INTO scraper_counties (name, state, court_type, base_url, status)
VALUES ('Test County', 'GA', 'superior', 'https://example.com', 'draft')
RETURNING *;
```

- [ ] Insert succeeds
- [ ] Data returned with generated UUID

Clean up test data:

```sql
DELETE FROM scraper_counties WHERE name = 'Test County';
```

---

## 🔄 Update Table Names in Code

Run the update script:

```bash
./update-table-names.sh
```

This updates:
- [ ] Python files (data_pipeline.py, api.py)
- [ ] TypeScript files (API routes, admin UI)
- [ ] Documentation SQL examples

---

## 🐍 Python API Tests (Optional - if FastAPI installed)

### Test 1: Import Check

```bash
cd scraper/pipeline
python3 -c "from data_pipeline import DataPipeline; print('✓ data_pipeline imports')"
python3 -c "from codegen_converter import CodegenConverter; print('✓ codegen_converter imports')"
python3 -c "from api import app; print('✓ api imports')"
```

- [ ] All imports successful

### Test 2: Start FastAPI Service

```bash
cd scraper/pipeline
uvicorn api:app --reload --port 8000
```

- [ ] Service starts without errors
- [ ] Visit http://localhost:8000/
- [ ] Visit http://localhost:8000/docs (API documentation)
- [ ] Stop with Ctrl+C

---

## ⚛️ Next.js Build Test

### Test 1: TypeScript Compilation

```bash
npx tsc --noEmit
```

- [ ] No critical errors (warnings OK)

### Test 2: Next.js Build

```bash
npm run build
```

- [ ] Build succeeds
- [ ] No critical errors

### Test 3: Development Server

```bash
npm run dev
```

- [ ] Server starts on http://localhost:3000
- [ ] Visit http://localhost:3000/admin/data-pipeline
- [ ] Page loads without errors
- [ ] Check browser console for errors
- [ ] Stop with Ctrl+C

---

## 📊 UI Functionality Test (Optional - if Next.js running)

With dev server running:

1. [ ] Navigate to http://localhost:3000/admin/data-pipeline
2. [ ] Click "Counties" tab - loads without error
3. [ ] Click "Supersets" tab - loads without error
4. [ ] Click "Processing Queue" tab - loads without error
5. [ ] Click "Review Queue" tab - loads without error
6. [ ] Open browser DevTools - no critical errors

---

## 📄 Documentation Review

Quick review:

- [ ] README_PIPELINE.md - instructions clear
- [ ] SYSTEM_SUMMARY.md - accurate overview
- [ ] PIPELINE_SETUP.md - setup steps correct
- [ ] DATA_PIPELINE_WORKFLOW.md - workflow makes sense
- [ ] TABLE_NAME_MIGRATION.md - mappings correct

---

## 🎯 Integration Test Checklist

### Scenario: Add a Test County

1. [ ] Open admin UI: http://localhost:3000/admin/data-pipeline
2. [ ] Click "+ Add County"
3. [ ] Fill in:
   - Name: Test County
   - State: GA
   - Court Type: Superior
   - Base URL: https://test.com
4. [ ] Click "Save County"
5. [ ] Verify county appears in list
6. [ ] Check Supabase Dashboard - county in `scraper_counties` table

### Clean Up Test Data

```sql
DELETE FROM scraper_counties WHERE name = 'Test County';
```

---

## 🚀 Final Pre-Commit Checks

- [ ] All automated tests pass (`./test-pipeline.sh`)
- [ ] Migration successful (10 tables created)
- [ ] Code compiles (no syntax errors)
- [ ] Next.js builds successfully
- [ ] Dev server runs without errors
- [ ] Documentation complete
- [ ] No sensitive data in code (API keys, passwords)
- [ ] `.env.local` in `.gitignore`

---

## 📝 Ready to Commit

Once all checks pass:

```bash
# Review changes
git status

# Stage all files
git add .

# Commit
git commit -m "Add data pipeline system for county court scraping

- Complete database schema (10 tables)
- Python pipeline orchestrator with queue system
- Codegen to config converter
- FastAPI service with 7 endpoints
- Next.js admin dashboard
- 5 API routes for pipeline operations
- Comprehensive documentation (5 guides)
- Setup and helper scripts
- Human-in-the-loop review queue
- RAG-ready with vector embeddings"

# Push (when ready)
git push
```

---

## 🆘 If Tests Fail

### Python Syntax Errors
- Check the specific file mentioned
- Fix syntax issues
- Re-run `./test-pipeline.sh`

### TypeScript Errors
- Run `npx tsc --noEmit` to see details
- Fix type errors in mentioned files
- Re-test

### Migration Fails
- Check error message in Supabase SQL Editor
- Verify `vector` extension enabled
- Try running migration again
- See `docs/TABLE_NAME_MIGRATION.md` for troubleshooting

### Build Fails
- Check error message
- Verify all dependencies installed (`npm install`)
- Check for missing imports
- Re-run build

---

## ✅ Success Criteria

All of these should be true:

✓ `./test-pipeline.sh` exits with code 0  
✓ 10 database tables exist in Supabase  
✓ Python files have no syntax errors  
✓ TypeScript compiles without critical errors  
✓ `npm run build` succeeds  
✓ Dev server runs and UI loads  
✓ Documentation is complete  
✓ No secrets committed  

**When all criteria met → SAFE TO COMMIT** 🎉
