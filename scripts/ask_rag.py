#!/usr/bin/env python3
"""CLI to test RAG ask. Requires: .env with SUPABASE_*, OPENAI_API_KEY, and RAG_LLM_PROVIDER (openai|anthropic)."""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag.ask import ask


def main():
    ap = argparse.ArgumentParser(description="RAG ask: retrieve + LLM answer")
    ap.add_argument("question", nargs="?", default="What did Georgia courts say about parental alienation?", help="Question to ask")
    ap.add_argument("--state", "-s", default="GA", help="Filter by state (default: GA)")
    ap.add_argument("--provider", "-p", choices=["openai", "anthropic"], help="Override RAG_LLM_PROVIDER")
    ap.add_argument("--top-k", type=int, default=10, help="Number of chunks to retrieve (default: 10)")
    ap.add_argument("--debug", "-d", action="store_true", help="Show retrieved chunks sent to LLM")
    args = ap.parse_args()

    state = (args.state or "").strip().upper() or None
    result = ask(args.question, state=state, top_k=args.top_k, provider=args.provider or None, debug_retrieve=args.debug)
    if args.debug and "retrieved_chunks" in result:
        print("RETRIEVED CHUNKS (sent to LLM):")
        for i, c in enumerate(result["retrieved_chunks"], 1):
            print(f"\n--- Chunk {i}: {c.get('case_name')} ({c.get('date_filed')}) sim={c.get('similarity')} ---")
            print(c.get("chunk_preview", ""))
        print("\n" + "=" * 60)
    print("ANSWER:")
    print(result["answer"])
    print("\nSOURCES:")
    print(json.dumps(result["sources"], indent=2))


if __name__ == "__main__":
    main()
