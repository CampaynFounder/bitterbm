"""Chunk and embed judge analysis from raw_cases. Mirrors chunk_embed logic."""
from __future__ import annotations

import os
from typing import Optional

from rag.chunk_embed import (
    CHUNK_OVERLAP,
    CHUNK_SIZE,
    EMBED_BATCH_SIZE,
    MAX_CHUNK_CHARS,
    chunk_text,
)
from rag.entity_extract import _supabase_client


def _embed_batch(texts: list[str], model: str = "text-embedding-3-small") -> list[list[float]]:
    from openai import OpenAI
    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    resp = client.embeddings.create(input=texts, model=model)
    by_idx = {d.index: d.embedding for d in resp.data}
    return [by_idx[i] for i in range(len(texts))]


def run_judge_chunk_embed(
    state: Optional[str] = None,
    model: str = "text-embedding-3-small",
) -> dict:
    """
    For each judge, collect opinion text from linked raw_cases, chunk, embed, insert
    into judge_analysis_embeddings. Uses same chunk/embed logic as case law.
    state: filter by state; None = all states.
    """
    sb = _supabase_client()

    # Get raw_cases with plain_text, joined to case_participants (judges)
    query = (
        sb.from_("raw_cases")
        .select("id, plain_text, state, county, court")
        .not_.is_("plain_text", "null")
    )
    if state:
        query = query.eq("state", state.strip().upper())
    cases = query.execute().data or []

    # Filter to training-ready (plain_text >= 200)
    cases = [c for c in cases if c.get("plain_text") and len((c["plain_text"] or "").strip()) >= 200]

    # Get case_participants for these cases
    case_ids = [c["id"] for c in cases]
    if not case_ids:
        return {"judges_processed": 0, "chunks_created": 0, "errors": [], "state_filter": state}

    participants = (
        sb.from_("case_participants")
        .select("raw_case_id, participant_id")
        .eq("participant_type", "judge")
        .in_("raw_case_id", case_ids)
        .execute()
        .data or []
    )

    # Group: judge_id -> list of plain_text
    case_by_id = {c["id"]: c for c in cases}
    judge_texts: dict[str, list[str]] = {}
    for p in participants:
        c = case_by_id.get(p["raw_case_id"])
        if not c or not c.get("plain_text"):
            continue
        jid = p["participant_id"]
        if jid not in judge_texts:
            judge_texts[jid] = []
        judge_texts[jid].append((c["plain_text"] or "").strip())

    judges_processed = 0
    chunks_created = 0
    errors: list[dict] = []

    for judge_id, texts in judge_texts.items():
        combined = "\n\n---\n\n".join(texts)
        if len(combined.strip()) < 200:
            continue

        chunks = chunk_text(combined, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP)
        if not chunks:
            continue

        try:
            embeddings = []
            for i in range(0, len(chunks), EMBED_BATCH_SIZE):
                batch = chunks[i : i + EMBED_BATCH_SIZE]
                embeddings.extend(_embed_batch(batch, model=model))
        except Exception as e:
            errors.append({"judge_id": judge_id, "error": str(e)})
            continue

        # Delete existing chunks for this judge (idempotent)
        try:
            sb.table("judge_analysis_embeddings").delete().eq("judge_id", judge_id).execute()
        except Exception:
            pass

        for i, (chunk_txt, emb) in enumerate(zip(chunks, embeddings)):
            try:
                if len(chunk_txt) > MAX_CHUNK_CHARS:
                    continue
                sb.table("judge_analysis_embeddings").insert({
                    "judge_id": judge_id,
                    "source_type": "opinion",
                    "chunk_text": chunk_txt,
                    "embedding": emb,
                    "metadata": {"chunk_index": i},
                }).execute()
                chunks_created += 1
            except Exception as e:
                errors.append({"judge_id": judge_id, "chunk_index": i, "error": str(e)})

        judges_processed += 1

    try:
        sb.table("pipeline_runs").insert({
            "step": "judge_chunk_embed",
            "status": "ok",
            "counts": {
                "judges_processed": judges_processed,
                "chunks_created": chunks_created,
                "errors_count": len(errors),
            },
            "filters": {"state": state} if state else {},
        }).execute()
    except Exception:
        pass

    return {
        "judges_processed": judges_processed,
        "chunks_created": chunks_created,
        "errors": errors,
        "state_filter": state,
    }


def run_attorney_chunk_embed(state: Optional[str] = None) -> dict:
    """Skeleton: no attorney data source yet. Same interface as run_judge_chunk_embed."""
    return {
        "attorneys_processed": 0,
        "chunks_created": 0,
        "errors": [],
        "state_filter": state,
        "message": "No attorney data source configured. PACER integration pending.",
    }


def run_expert_chunk_embed(state: Optional[str] = None) -> dict:
    """Skeleton: no expert data source yet. Same interface as run_judge_chunk_embed."""
    return {
        "experts_processed": 0,
        "chunks_created": 0,
        "errors": [],
        "state_filter": state,
        "message": "No expert data source configured. JurisPro/state boards integration pending.",
    }
