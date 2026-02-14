#!/usr/bin/env bash
#
# Full data refresh for BitterBM CourtListener pipeline.
# Run once bugs are ironed out to refresh all cases for configured states/search terms.
#
# Usage:
#   ./scripts/refresh_data.sh                    # GA, alienation, 500, no full text
#   ./scripts/refresh_data.sh --state NC         # North Carolina
#   ./scripts/refresh_data.sh --query "alienation custody"
#   ./scripts/refresh_data.sh --full-text        # Fetch full opinion text (RAG-ready, slower)
#   ./scripts/refresh_data.sh --max 1000
#
# Options:
#   --state STATE     State code (GA, NC, FL, TX). Default: GA
#   --query QUERY     Search term(s). alienat* = alienation/alienated/alienating. Default: alienat*
#   --max N           Max results per state. Default: 500
#   --full-text       Fetch full opinion text for each case (slower, more API calls)
#   --http            Use HTTP trigger instead of Modal CLI (needs env: NEXT_PUBLIC_MODAL_TRIGGER_URL, NEXT_PUBLIC_PIPELINE_TRIGGER_SECRET)
#
set -e

STATE="GA"
QUERY="alienat*"
MAX=500
FULL_TEXT=""
USE_HTTP=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --state)
      STATE="$2"
      shift 2
      ;;
    --query)
      QUERY="$2"
      shift 2
      ;;
    --max)
      MAX="$2"
      shift 2
      ;;
    --full-text)
      FULL_TEXT="--fetch-full-text"
      shift
      ;;
    --http)
      USE_HTTP=1
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "=== BitterBM Data Refresh ==="
echo "State: $STATE | Query: $QUERY | Max: $MAX"
[[ -n $FULL_TEXT ]] && echo "Mode: with full text (RAG-ready)"
echo ""

if [[ -n $USE_HTTP ]]; then
  URL="${NEXT_PUBLIC_MODAL_TRIGGER_URL}"
  SECRET="${NEXT_PUBLIC_PIPELINE_TRIGGER_SECRET}"
  if [[ -z $URL || -z $SECRET ]]; then
    echo "Error: Set NEXT_PUBLIC_MODAL_TRIGGER_URL and NEXT_PUBLIC_PIPELINE_TRIGGER_SECRET for --http mode"
    exit 1
  fi
  FT=false
  [[ -n $FULL_TEXT ]] && FT=true
  BODY=$(jq -n \
    --arg query "$QUERY" \
    --arg state "$STATE" \
    --argjson max "$MAX" \
    --argjson ft "$FT" \
    '{query: $query, state: $state, max_results: $max, fetch_full_text: $ft}')
  echo "Triggering HTTP endpoint..."
  curl -s -X POST "$URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SECRET" \
    -d "$BODY" | jq .
else
  echo "Running Modal fetch..."
  cd "$(dirname "$0")/.."
  python -m modal run modal_courtlistener_test.py::main \
    --action fetch \
    --query "$QUERY" \
    --state "$STATE" \
    --max-results "$MAX" \
    $FULL_TEXT
fi

echo ""
echo "Done. Check Supabase raw_cases and pipeline_runs."
