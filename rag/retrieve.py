"""Retrieve case chunks by semantic similarity with optional state filter and keyword boost."""
from __future__ import annotations

import os
from typing import Optional

def _supabase_client():
    from supabase import create_client
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
    return create_client(url, key)


def _keyword_chunks(
    sb,
    keyword: str,
    state: Optional[str],
    limit: int = 5,
) -> list[dict]:
    """Fetch chunks containing keyword (e.g. alienat) to boost retrieval."""
    query = sb.table("case_chunks").select(
        "cluster_id, case_name, county, judge, date_filed, chunk_text, chunk_index, state, metadata"
    ).ilike("chunk_text", f"%{keyword}%").limit(limit)
    if state:
        query = query.eq("state", state.strip().upper())
    rows = query.execute().data or []
    return [
        {
            "cluster_id": r.get("cluster_id"),
            "chunk_text": r.get("chunk_text"),
            "case_name": r.get("case_name"),
            "county": r.get("county"),
            "judge": r.get("judge"),
            "date_filed": r.get("date_filed"),
            "chunk_index": r.get("chunk_index"),
            "state": r.get("state"),
            "similarity": 1.0,
            "metadata": r.get("metadata") or {},
        }
        for r in rows
    ]


def retrieve(
    query: str,
    state: Optional[str] = None,
    top_k: int = 5,
    embed_model: str = "text-embedding-3-small",
    keyword_filter: Optional[str] = None,
) -> list[dict]:
    """
    Semantic search over case_chunks with optional keyword boost.
    When keyword_filter is set (e.g. "alienat"), chunks containing that keyword are
    fetched and prepended to vector results so alienation-specific cases surface.
    Returns list of dicts: chunk_text, case_name, county, judge, date_filed, state, similarity.
    """
    sb = _supabase_client()
    seen_keys = set()
    merged = []

    if keyword_filter:
        kw_chunks = _keyword_chunks(sb, keyword_filter, state, limit=min(5, top_k))
        for c in kw_chunks:
            key = (c.get("cluster_id"), c.get("chunk_index"))
            if key not in seen_keys:
                seen_keys.add(key)
                merged.append(c)

    from openai import OpenAI
    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    resp = client.embeddings.create(input=[query], model=embed_model)
    query_embedding = resp.data[0].embedding

    params = {"query_embedding": query_embedding, "match_count": top_k}
    if state:
        params["filter_state"] = state.strip().upper()

    result = sb.rpc("match_case_chunks", params).execute()
    rows = result.data or []

    for r in rows:
        key = (r.get("cluster_id"), r.get("chunk_index"))
        if key not in seen_keys:
            seen_keys.add(key)
            merged.append({
                "cluster_id": r.get("cluster_id"),
                "chunk_text": r.get("chunk_text"),
                "case_name": r.get("case_name"),
                "county": r.get("county"),
                "judge": r.get("judge"),
                "date_filed": r.get("date_filed"),
                "chunk_index": r.get("chunk_index"),
                "state": r.get("state"),
                "similarity": r.get("similarity"),
                "metadata": r.get("metadata") or {},
            })

    return merged[:top_k]
