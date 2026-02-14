#!/usr/bin/env python3
"""
Fetch Georgia family court cases with "alienation" from CourtListener
and store in GA County / Judge / Date RAG structure.

Usage:
    export COURTLISTENER_API_TOKEN=your_token
    python fetch_ga_alienation.py [--max 200] [--output rag]
"""

import argparse
import os
import sys
import time
from pathlib import Path

# Add parent for local imports
sys.path.insert(0, str(Path(__file__).resolve().parent))

from courtlistener_client import CourtListenerClient
from rag_storage import RAGStorage


def main():
    parser = argparse.ArgumentParser(
        description="Fetch GA alienation cases from CourtListener into RAG storage"
    )
    parser.add_argument(
        "--max",
        type=int,
        default=200,
        help="Max results to fetch (default 200)",
    )
    parser.add_argument(
        "--output",
        default="rag",
        help="Base directory for RAG storage (default: rag)",
    )
    parser.add_argument(
        "--filed-after",
        help="Only cases filed after this date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--filed-before",
        help="Only cases filed before this date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--fetch-text",
        action="store_true",
        help="Fetch full opinion text for each case (slower, more API calls)",
    )
    args = parser.parse_args()

    token = os.environ.get("COURTLISTENER_API_TOKEN")
    if not token:
        print("ERROR: Set COURTLISTENER_API_TOKEN environment variable")
        print("Get your token from: https://www.courtlistener.com/profile/")
        sys.exit(1)

    client = CourtListenerClient(api_token=token)
    storage = RAGStorage(base_dir=args.output)

    print("Searching CourtListener for Georgia cases with 'alienation'...")
    results = client.search_opinions(
        query="alienation",
        courts=["gact", "gactapp"],
        filed_after=args.filed_after,
        filed_before=args.filed_before,
        max_results=args.max,
    )

    print(f"\nFound {len(results)} results. Storing in RAG structure...")

    stored = 0
    for i, result in enumerate(results, 1):
        metadata = client.extract_rag_metadata(result)
        text = None

        if args.fetch_text and result.get("opinions"):
            opinion_id = result["opinions"][0].get("id")
            if opinion_id:
                text = client.get_opinion_text(opinion_id)
                time.sleep(1)

        path = storage.store_case(metadata, text=text, raw_result=result)
        if args.fetch_text and text:
            storage.store_text_only(metadata, text)
        stored += 1
        try:
            rel = path.relative_to(Path(args.output).resolve())
        except ValueError:
            rel = path
        print(f"  [{i}/{len(results)}] {metadata.get('case_name', 'N/A')} -> {rel}")

    print(f"\nDone. Stored {stored} cases in {args.output}/GA/")


if __name__ == "__main__":
    main()
