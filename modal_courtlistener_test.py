#!/usr/bin/env python3
"""Test CourtListener retrieval and storage before RAG.

Fetches GA alienation cases from CourtListener, stores to Modal Volume + Supabase.
Run from project root: python3 -m modal run modal_courtlistener_test.py

Secrets: courtlistener, supabase-secret, pipeline-trigger
"""
from __future__ import annotations

import json
from typing import Optional
import os
import sys
from datetime import datetime
from pathlib import Path

import modal

# Add courtlistener for imports when run via modal
sys.path.insert(0, str(Path(__file__).resolve().parent / "courtlistener"))

from courtlistener_client import CourtListenerClient
from rag_storage import RAGStorage


def _supabase_client():
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
    return create_client(url, key)


def _upsert_raw_case(result: dict, metadata: dict) -> None:
    sb = _supabase_client()
    date_filed = metadata.get("date_filed")
    try:
        if isinstance(date_filed, str) and len(date_filed) >= 10:
            date_filed = date_filed[:10]  # YYYY-MM-DD
    except Exception:
        date_filed = None

    row = {
        "cluster_id": str(metadata.get("cluster_id", "")),
        "case_name": metadata.get("case_name"),
        "case_name_full": metadata.get("case_name_full"),
        "court": metadata.get("court"),
        "court_id": metadata.get("court_id"),
        "county": metadata.get("county", "Georgia"),
        "judge": metadata.get("judge"),
        "date_filed": date_filed,
        "docket_number": metadata.get("docket_number"),
        "citation": metadata.get("citation"),
        "source": "courtlistener",
        "metadata": result,
    }
    sb.table("raw_cases").upsert(row, on_conflict="cluster_id,source").execute()


def _log_pipeline_run(
    step: str, status: str, counts: dict, filters: Optional[dict] = None
) -> None:
    sb = _supabase_client()
    sb.table("pipeline_runs").insert(
        {"step": step, "status": status, "counts": counts, "filters": filters or {}}
    ).execute()

app = modal.App("courtlistener-test")

# Persistent volume for raw case storage (tests storage before Supabase)
volume = modal.Volume.from_name("courtlistener-rag", create_if_missing=True)

image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "requests",
    "supabase",
)

image_web = modal.Image.debian_slim(python_version="3.11").pip_install(
    "fastapi[standard]",
)

FILTERS = {"query": "alienation", "courts": ["gact", "gactapp"]}


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("courtlistener"),
        modal.Secret.from_name("supabase-secret"),
    ],
    volumes={"/data": volume},
    timeout=300,
)
def fetch_and_store(max_results: int = 20, write_supabase: bool = True) -> dict:
    """
    Fetch GA alienation cases from CourtListener and store in Modal Volume.
    Returns summary of what was stored.
    """
    base_dir = Path("/data/rag")
    storage = RAGStorage(base_dir=base_dir)

    client = CourtListenerClient()

    results = client.search_opinions(
        query="alienation",
        courts=["gact", "gactapp"],
        max_results=max_results,
    )

    stored_paths = []
    supabase_stored = 0

    for result in results:
        metadata = client.extract_rag_metadata(result)
        path = storage.store_case(metadata, text=None, raw_result=result)
        stored_paths.append(
            {"path": str(path.relative_to(base_dir)), "case": metadata.get("case_name", "N/A")}
        )

        if write_supabase:
            try:
                _upsert_raw_case(result, metadata)
                supabase_stored += 1
            except Exception as e:
                # Log but continue
                print(f"Supabase upsert failed for {metadata.get('cluster_id')}: {e}")

    volume.commit()

    counts = {"fetched": len(results), "volume_stored": len(stored_paths)}
    if write_supabase:
        counts["supabase_stored"] = supabase_stored
        _log_pipeline_run("fetch", "ok", counts, FILTERS)

    return {
        "fetched": len(results),
        "stored": len(stored_paths),
        "supabase_stored": supabase_stored,
        "base_dir": str(base_dir),
        "samples": stored_paths[:5],
    }


@app.function(
    image=image,
    volumes={"/data": volume},
    timeout=60,
)
def verify_storage() -> dict:
    """
    Read back from Modal Volume to verify storage and retrieval.
    """
    base_dir = Path("/data/rag")
    storage = RAGStorage(base_dir=base_dir)

    docs = storage.list_documents()

    samples = []
    for doc in docs[:5]:
        meta = doc.get("metadata", {})
        samples.append(
            {
                "case_name": meta.get("case_name"),
                "court": meta.get("court"),
                "date_filed": meta.get("date_filed"),
                "path": doc.get("_path", ""),
            }
        )

    return {
        "total_documents": len(docs),
        "base_dir": str(base_dir),
        "samples": samples,
    }


@app.function(
    image=image_web,
    secrets=[modal.Secret.from_name("pipeline-trigger")],
)
@modal.fastapi_endpoint(method="POST")
async def trigger_fetch(request: "Request"):
    """HTTP endpoint to trigger CourtListener fetch. Requires Bearer token."""
    import asyncio
    import os
    from fastapi import HTTPException, Request, status

    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization: Bearer header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = auth[7:].strip()
    expected = os.environ.get("TRIGGER_SECRET")
    if not expected or token != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    max_results = int(body.get("max_results", 20))
    max_results = max(1, min(max_results, 500))

    result = await asyncio.to_thread(
        fetch_and_store.remote, max_results=max_results, write_supabase=True
    )
    return result


@app.local_entrypoint()
def main(action: str = "fetch", max_results: int = 20):
    """
    Test CourtListener fetch and storage.

    Actions:
      fetch   - Fetch cases and store to Modal Volume (default)
      verify  - Read back stored documents to confirm retrieval
    """
    if action == "fetch":
        out = fetch_and_store.remote(max_results=max_results)
        print("Fetch & Store Result:")
        print(json.dumps(out, indent=2))
    elif action == "verify":
        out = verify_storage.remote()
        print("Verify Storage Result:")
        print(json.dumps(out, indent=2))
    else:
        print(f"Unknown action: {action}. Use 'fetch' or 'verify'.")
