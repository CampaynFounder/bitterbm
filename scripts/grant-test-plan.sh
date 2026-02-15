#!/bin/bash
# Grant yourself flat plan (unlimited access) for testing.
# Usage: ADMIN_SECRET=xxx ./scripts/grant-test-plan.sh [BASE_URL]
# Or add ADMIN_SECRET to .env and run: set -a && source .env 2>/dev/null; set +a; ./scripts/grant-test-plan.sh
# Get your access token: Log in, then DevTools > Application > Local Storage > supabase.auth.token
# Or run in console: (await supabase.auth.getSession()).data.session?.access_token

set -e
BASE_URL="${1:-http://localhost:3000}"

if [ -z "$ADMIN_SECRET" ]; then
  echo "Usage: ADMIN_SECRET=your_secret $0 [BASE_URL]"
  echo "Add ADMIN_SECRET to .env or pass inline."
  exit 1
fi

echo "Paste your Supabase session access_token (from localStorage or getSession):"
read -r TOKEN

if [ -z "$TOKEN" ]; then
  echo "Token required"
  exit 1
fi

curl -s -X POST "$BASE_URL/api/admin/grant-test-plan" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" | jq . 2>/dev/null || cat
