"""Chunk and embed training_ready_cases into case_chunks (Supabase pgvector).
Supports state filter: process one state or all.
"""
from __future__ import annotations

import os
import re
from typing import Optional

# Chunk params: ~500 tokens ≈ 2000 chars, 128 token overlap ≈ 512 chars
CHUNK_SIZE = 2000
CHUNK_OVERLAP = 512

# OpenAI embedding model limit 8192 tokens
MAX_CHUNK_CHARS = 6000  # ~1500 tokens; no single chunk may exceed embedding limit
EMBED_BATCH_SIZE = 4


def _split_oversized(chunks: list[str], max_chars: int = MAX_CHUNK_CHARS) -> list[str]:
    """Split any chunk exceeding max_chars (avoids embedding API token limit)."""
    out = []
    for c in chunks:
        if len(c) <= max_chars:
            out.append(c)
        else:
            for i in range(0, len(c), max_chars):
                out.append(c[i : i + max_chars])
    return out


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """
    Split text into overlapping chunks, preserving paragraph boundaries.
    """
    if not text or not text.strip():
        return []
    text = text.strip()
    paragraphs = re.split(r"\n\s*\n", text)
    chunks = []
    current = ""
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if len(current) + len(para) > chunk_size and current:
            chunks.append(current.strip())
            overlap_text = current[-overlap:] if len(current) > overlap else current
            current = overlap_text + "\n\n" + para
        else:
            current = (current + "\n\n" + para) if current else para
    if current.strip():
        chunks.append(current.strip())
    return _split_oversized(chunks)


def _supabase_client():
    from supabase import create_client
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
    return create_client(url, key)


def _embed_batch(texts: list[str], model: str = "text-embedding-3-small") -> list[list[float]]:
    from openai import OpenAI
    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    resp = client.embeddings.create(input=texts, model=model)
    by_idx = {d.index: d.embedding for d in resp.data}
    return [by_idx[i] for i in range(len(texts))]


def run_chunk_embed(
    state: Optional[str] = None,
    batch_size: int = 50,
    model: str = "text-embedding-3-small",
) -> dict:
    """
    Read training_ready_cases, chunk plain_text, embed, insert into case_chunks.
    state: filter by state (e.g. 'GA'); None = process all states.
    Returns counts: cases_processed, chunks_created, errors.
    """
    sb = _supabase_client()

    query = sb.from_("training_ready_cases").select("*")
    if state:
        query = query.eq("state", state.strip().upper())
    rows = query.execute().data or []

    cases_processed = 0
    chunks_created = 0
    errors = []

    for row in rows:
        plain = (row.get("plain_text") or "").strip()
        if len(plain) < 200:
            continue

        state_val = (row.get("state") or "GA").strip().upper()
        chunks = chunk_text(plain)
        if not chunks:
            continue

        # Embed in batches to stay under model 8192-token limit
        embeddings = []
        try:
            for i in range(0, len(chunks), EMBED_BATCH_SIZE):
                batch = chunks[i : i + EMBED_BATCH_SIZE]
                embeddings.extend(_embed_batch(batch, model=model))
        except Exception as e:
            errors.append({"cluster_id": row.get("cluster_id"), "error": str(e)})
            continue

        # Remove existing chunks for this case (idempotent re-runs)
        cluster_id_str = str(row.get("cluster_id", ""))
        try:
            sb.table("case_chunks").delete().eq("cluster_id", cluster_id_str).execute()
        except Exception:
            pass

        for i, (chunk_txt, emb) in enumerate(zip(chunks, embeddings)):
            try:
                sb.table("case_chunks").insert({
                    "cluster_id": cluster_id_str,
                    "case_name": row.get("case_name"),
                    "county": row.get("county", "Georgia"),
                    "judge": row.get("judge"),
                    "date_filed": row.get("date_filed"),
                    "chunk_text": chunk_txt,
                    "chunk_index": i,
                    "embedding": emb,
                    "state": state_val,
                    "metadata": {
                        "case_name_full": row.get("case_name_full"),
                        "court": row.get("court"),
                        "court_id": row.get("court_id"),
                        "docket_number": row.get("docket_number"),
                        "citation": row.get("citation"),
                    },
                }).execute()
                chunks_created += 1
            except Exception as e:
                errors.append({"chunk_index": i, "cluster_id": row.get("cluster_id"), "error": str(e)})

        cases_processed += 1

    # Log to pipeline_runs
    try:
        sb.table("pipeline_runs").insert({
            "step": "chunk",
            "status": "ok",
            "counts": {
                "cases_processed": cases_processed,
                "chunks_created": chunks_created,
                "errors_count": len(errors),
            },
            "filters": {"state": state} if state else {},
        }).execute()
    except Exception:
        pass

    return {
        "cases_processed": cases_processed,
        "chunks_created": chunks_created,
        "errors": errors,
        "state_filter": state,
    }
