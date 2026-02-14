#!/usr/bin/env python3
"""Run chunk+embed locally. Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY."""
import warnings

warnings.filterwarnings("ignore", message="urllib3 v2 only supports OpenSSL")

import argparse
import json
import os
import sys

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag.chunk_embed import run_chunk_embed


def main():
    ap = argparse.ArgumentParser(description="Chunk and embed training_ready_cases into case_chunks")
    ap.add_argument("--state", "-s", help="Filter by state (e.g. GA); omit for all states")
    args = ap.parse_args()
    state = (args.state or "").strip() or None
    result = run_chunk_embed(state=state)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
