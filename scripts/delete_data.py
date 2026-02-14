#!/usr/bin/env python3
"""
Delete pipeline data from Supabase so you can rerun and retest.

Deletes all rows from: case_chunks, raw_cases, pipeline_runs

Usage:
  export SUPABASE_URL=your_url
  export SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
  python scripts/delete_data.py --confirm

The service role key is required to bypass RLS. Get it from:
  Supabase Dashboard → Project Settings → API → service_role (secret)
"""
from __future__ import annotations

import argparse
import os
import sys


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Delete BitterBM pipeline data from Supabase for retesting"
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Required. Confirms you want to delete all data.",
    )
    args = parser.parse_args()

    if not args.confirm:
        print("Error: Add --confirm to proceed. This will delete ALL pipeline data.")
        sys.exit(1)

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Error: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
        print("  Get from: Supabase Dashboard → Project Settings → API")
        sys.exit(1)

    try:
        from supabase import create_client
    except ImportError:
        print("Error: Install supabase: pip install supabase")
        sys.exit(1)

    sb = create_client(url, key)

    tables = ["case_chunks", "raw_cases", "pipeline_runs"]
    print("Deleting pipeline data...")
    for table in tables:
        try:
            res = sb.table(table).delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
            n = len(res.data) if res.data else 0
            print(f"  {table}: deleted {n} rows")
        except Exception as e:
            print(f"  {table}: {e}")

    print("Done. You can rerun the fetch pipeline.")


if __name__ == "__main__":
    main()
