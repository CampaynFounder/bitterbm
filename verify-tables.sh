#!/bin/bash

# Verify Scraper Pipeline Tables
# Checks that all required tables exist and are accessible

echo "🔍 Verifying scraper pipeline tables..."
echo ""

# Check if we can connect to Supabase
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
    echo "⚠️  NEXT_PUBLIC_SUPABASE_URL not set"
    echo "   Please set environment variables in .env.local"
    exit 1
fi

echo "✅ Environment variables found"
echo ""

# List of expected tables
expected_tables=(
    "scraper_counties"
    "scraper_configs"
    "scraper_supersets"
    "scraped_cases"
    "scraped_documents"
    "scraped_doc_chunks"
    "scraper_queue"
    "scraper_review_queue"
    "scraper_judges"
    "scraper_attorneys"
)

echo "📋 Expected tables:"
for table in "${expected_tables[@]}"; do
    echo "   - $table"
done
echo ""

# SQL query to check tables
sql_query="
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND (table_name LIKE 'scraper%' OR table_name LIKE 'scraped%')
ORDER BY table_name;
"

echo "🔍 Checking database..."
echo ""

# Try with supabase CLI if available
if command -v supabase &> /dev/null; then
    echo "Using Supabase CLI..."
    supabase db query "$sql_query"
else
    echo "⚠️  Supabase CLI not installed"
    echo "   Install: npm install -g supabase"
    echo ""
    echo "   Or verify manually in Supabase dashboard:"
    echo "   SQL Editor → Run:"
    echo ""
    echo "$sql_query"
fi

echo ""
echo "📊 To verify tables manually:"
echo "   1. Go to Supabase Dashboard"
echo "   2. Navigate to SQL Editor"
echo "   3. Run the query above"
echo ""
echo "   You should see all 10 tables listed"
echo ""
