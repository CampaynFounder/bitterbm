#!/bin/bash

# Update Table Names Script
# Automatically updates all code files to use new table names

echo "🔄 Updating table names in all code files..."
echo ""

# Define replacements (old → new)
declare -A replacements=(
    ["'counties'"]="'scraper_counties'"
    ["'supersets'"]="'scraper_supersets'"
    ["'cases'"]="'scraped_cases'"
    ["'case_documents'"]="'scraped_documents'"
    ["'document_chunks'"]="'scraped_doc_chunks'"
    ["'processing_queue'"]="'scraper_queue'"
    ["'review_queue'"]="'scraper_review_queue'"
    ["'judges'"]="'scraper_judges'"
    ["'attorneys'"]="'scraper_attorneys'"
)

# Files to update
files=(
    "scraper/pipeline/data_pipeline.py"
    "scraper/pipeline/api.py"
    "app/admin/data-pipeline/page.tsx"
    "app/api/pipeline/generate-superset/route.ts"
    "app/api/pipeline/convert-codegen/route.ts"
    "app/api/pipeline/validate-config/route.ts"
    "app/api/pipeline/process-queue/route.ts"
    "app/api/pipeline/stats/route.ts"
)

# Backup directory
backup_dir="backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$backup_dir"

# Process each file
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "📝 Updating $file..."
        
        # Backup original
        cp "$file" "$backup_dir/$(basename $file)"
        
        # Apply replacements
        for old in "${!replacements[@]}"; do
            new="${replacements[$old]}"
            sed -i.bak "s/$old/$new/g" "$file"
            rm "${file}.bak" 2>/dev/null
        done
        
        echo "   ✅ Done"
    else
        echo "   ⚠️  File not found: $file"
    fi
done

# Update function name in SQL examples (in docs)
doc_files=(
    "docs/PIPELINE_SETUP.md"
    "docs/DATA_PIPELINE_WORKFLOW.md"
    "docs/SYSTEM_SUMMARY.md"
)

echo ""
echo "📚 Updating documentation..."

for file in "${doc_files[@]}"; do
    if [ -f "$file" ]; then
        echo "📝 Updating $file..."
        cp "$file" "$backup_dir/$(basename $file)"
        
        # Update table names in SQL examples
        sed -i.bak "s/FROM cases/FROM scraped_cases/g" "$file"
        sed -i.bak "s/FROM judges/FROM scraper_judges/g" "$file"
        sed -i.bak "s/FROM counties/FROM scraper_counties/g" "$file"
        sed -i.bak "s/match_documents(/match_scraped_documents(/g" "$file"
        
        rm "${file}.bak" 2>/dev/null
        echo "   ✅ Done"
    fi
done

echo ""
echo "✅ All files updated!"
echo ""
echo "📦 Backups saved to: $backup_dir"
echo ""
echo "🚀 Next steps:"
echo "   1. Run: supabase db push"
echo "   2. Restart services: ./dev.sh"
echo "   3. Verify tables: psql -c \"\\dt scraper*\""
echo ""
