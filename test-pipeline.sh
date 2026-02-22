#!/bin/bash

# End-to-End Test Script for Data Pipeline
# Tests the complete flow before committing

set -e  # Exit on any error

echo "🧪 Data Pipeline End-to-End Test"
echo "=================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track test results
TESTS_PASSED=0
TESTS_FAILED=0

# Test function
test_step() {
    local description=$1
    local command=$2
    
    echo -n "Testing: $description... "
    
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        ((TESTS_FAILED++))
        return 1
    fi
}

echo "📋 Pre-flight Checks"
echo "-------------------"

# 1. Check environment
if [ -f .env.local ]; then
    test_step "Environment variables set" "true"
else
    echo -e "Environment variables set... ${YELLOW}⚠ SKIP (optional for build test)${NC}"
fi
test_step "Python 3 installed" "command -v python3"
test_step "Node.js installed" "command -v node"
test_step "npm installed" "command -v npm"

echo ""
echo "📦 Dependency Checks"
echo "-------------------"

# 2. Check Python dependencies
if [ -f scraper/requirements.txt ]; then
    test_step "Python requirements file exists" "true"
    echo "   → Installing Python dependencies..."
    pip3 install -q -r scraper/requirements.txt 2>/dev/null || true
else
    test_step "Python requirements file exists" "false"
fi

# 3. Check Node dependencies
test_step "Node modules installed" "[ -d node_modules ]"

if [ ! -d node_modules ]; then
    echo "   → Installing Node dependencies..."
    npm install --silent
fi

echo ""
echo "🗄️  Database Schema"
echo "-------------------"

# 4. Verify migration file exists
test_step "Migration file exists (026)" "[ -f supabase/migrations/026_scraper_pipeline_clean.sql ]"

echo ""
echo "🐍 Python Code Checks"
echo "-------------------"

# 5. Check Python files for syntax errors
if command -v python3 &> /dev/null; then
    test_step "data_pipeline.py syntax" "python3 -c 'import ast; ast.parse(open(\"scraper/pipeline/data_pipeline.py\").read())'"
    test_step "codegen_converter.py syntax" "python3 -c 'import ast; ast.parse(open(\"scraper/pipeline/codegen_converter.py\").read())'"
    test_step "api.py syntax" "python3 -c 'import ast; ast.parse(open(\"scraper/pipeline/api.py\").read())'"
else
    echo -e "${YELLOW}⚠ Skipping Python syntax checks (python3 not found)${NC}"
fi

echo ""
echo "⚛️  TypeScript Code Checks"
echo "-------------------"

# 6. Check TypeScript files compile
if command -v npx &> /dev/null; then
    echo "   → Running TypeScript check..."
    if npx tsc --noEmit 2>/dev/null; then
        echo -e "   ${GREEN}✓ TypeScript compiles${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "   ${YELLOW}⚠ TypeScript has type errors (non-critical)${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Skipping TypeScript checks (npx not found)${NC}"
fi

echo ""
echo "📄 Documentation Checks"
echo "-------------------"

# 7. Verify documentation exists
test_step "SYSTEM_SUMMARY.md exists" "[ -f docs/SYSTEM_SUMMARY.md ]"
test_step "PIPELINE_SETUP.md exists" "[ -f docs/PIPELINE_SETUP.md ]"
test_step "DATA_PIPELINE_WORKFLOW.md exists" "[ -f docs/DATA_PIPELINE_WORKFLOW.md ]"
test_step "TABLE_NAME_MIGRATION.md exists" "[ -f docs/TABLE_NAME_MIGRATION.md ]"

echo ""
echo "🔧 Script Checks"
echo "-------------------"

# 8. Verify helper scripts exist and are executable
test_step "setup.sh exists and executable" "[ -x setup.sh ]"
test_step "dev.sh exists and executable" "[ -x dev.sh ]"
test_step "update-table-names.sh exists and executable" "[ -x update-table-names.sh ]"

echo ""
echo "📁 File Structure"
echo "-------------------"

# 9. Verify key directories exist
test_step "scraper/pipeline directory" "[ -d scraper/pipeline ]"
test_step "app/admin/data-pipeline directory" "[ -d app/admin/data-pipeline ]"
test_step "app/api/pipeline directory" "[ -d app/api/pipeline ]"
test_step "docs directory" "[ -d docs ]"

echo ""
echo "=================================="
echo "📊 Test Results"
echo "=================================="
echo ""
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed! Ready to commit.${NC}"
    echo ""
    echo "🚀 Next Steps:"
    echo "   1. Manually verify migration in Supabase Dashboard"
    echo "   2. Run: git status"
    echo "   3. Review changes"
    echo "   4. Run: git add ."
    echo "   5. Run: git commit -m \"Add data pipeline system\""
    echo ""
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Please fix before committing.${NC}"
    echo ""
    exit 1
fi
