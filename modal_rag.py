#!/usr/bin/env python3
"""RAG pipeline: chunk, embed, retrieve, ask.

Modal functions for chunk+embed (batch job) and optional RAG endpoints.
Run: modal run modal_rag.py chunk_embed --state GA
Deploy: modal deploy modal_rag.py  → provides web endpoint for UI trigger
"""
from __future__ import annotations

import asyncio
import json
import os

import modal

app = modal.App("bitterbm-rag")

image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "openai",
    "anthropic",
    "supabase",
)

# Add rag package so it can be imported
image = image.add_local_dir("rag", remote_path="/root/rag")

image_web = modal.Image.debian_slim(python_version="3.11").pip_install("starlette")


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("supabase-secret"),
        modal.Secret.from_name("openai"),  # OPENAI_API_KEY
    ],
    timeout=600,
)
def chunk_embed(state: str | None = None) -> dict:
    """
    Chunk training_ready_cases and embed into case_chunks.
    state: filter by state (e.g. 'GA'); None = all states.
    """
    import sys
    sys.path.insert(0, "/root")
    from rag.chunk_embed import run_chunk_embed
    return run_chunk_embed(state=state)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("supabase-secret")],
    timeout=300,
)
def extract_judges(state: str | None = None) -> dict:
    """Extract judges from raw_cases into judges + case_participants."""
    import sys
    sys.path.insert(0, "/root")
    from rag.entity_extract import run_extract_judges
    return run_extract_judges(state=state)


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("supabase-secret"),
        modal.Secret.from_name("openai"),
    ],
    timeout=600,
)
def judge_chunk_embed(state: str | None = None) -> dict:
    """Chunk and embed judge analysis into judge_analysis_embeddings."""
    import sys
    sys.path.insert(0, "/root")
    from rag.judge_chunk_embed import run_judge_chunk_embed
    return run_judge_chunk_embed(state=state)


@app.function(
    image=image_web,
    secrets=[modal.Secret.from_name("pipeline-trigger")],
)
@modal.asgi_app()
def trigger_chunk_embed():
    """HTTP endpoint to trigger chunk+embed from admin UI. POST with Bearer token, body: { state?: "GA" }"""
    from starlette.applications import Starlette
    from starlette.requests import Request
    from starlette.responses import JSONResponse
    from starlette.routing import Route

    ALLOWED_ORIGINS = {"https://bitterbm.com", "http://localhost:3000"}

    def _cors_headers(req: Request):
        origin = req.headers.get("origin", "https://bitterbm.com")
        allow_origin = origin if origin in ALLOWED_ORIGINS else "https://bitterbm.com"
        return {
            "Access-Control-Allow-Origin": allow_origin,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
        }

    async def trigger_endpoint(req: Request):
        cors = _cors_headers(req)
        if req.method == "OPTIONS":
            return JSONResponse({}, headers=cors)
        if req.method != "POST":
            return JSONResponse({"detail": "Method not allowed"}, status_code=405, headers=cors)
        auth = req.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return JSONResponse({"detail": "Missing Authorization"}, status_code=401, headers=cors)
        token = auth[7:].strip()
        expected = os.environ.get("TRIGGER_SECRET")
        if not expected or token != expected:
            return JSONResponse({"detail": "Invalid token"}, status_code=401, headers=cors)
        body = {}
        try:
            body_bytes = await req.body()
            if body_bytes:
                body = json.loads(body_bytes)
        except Exception:
            pass
        state = (body.get("state") or "").strip().upper() or None
        action = (body.get("action") or "chunk_embed").strip()

        if action == "extract_judges":
            result = await asyncio.to_thread(lambda: extract_judges.remote(state=state))
        elif action == "judge_chunk_embed":
            result = await asyncio.to_thread(lambda: judge_chunk_embed.remote(state=state))
        else:
            result = await asyncio.to_thread(lambda: chunk_embed.remote(state=state))
        return JSONResponse(result, headers=cors)

    return Starlette(routes=[Route("/", trigger_endpoint, methods=["POST", "OPTIONS"])])


@app.local_entrypoint()
def main(
    action: str = "chunk_embed",
    state: str | None = None,
):
    """
    RAG pipeline actions.
    chunk_embed       - Case law: training_ready_cases → case_chunks
    extract_judges    - raw_cases → judges + case_participants
    judge_chunk_embed - judges + opinion text → judge_analysis_embeddings
    """
    if action == "chunk_embed":
        result = chunk_embed.remote(state=state or None)
        print("Chunk & Embed Result:")
        print(json.dumps(result, indent=2))
    elif action == "extract_judges":
        result = extract_judges.remote(state=state or None)
        print("Extract Judges Result:")
        print(json.dumps(result, indent=2))
    elif action == "judge_chunk_embed":
        result = judge_chunk_embed.remote(state=state or None)
        print("Judge Chunk & Embed Result:")
        print(json.dumps(result, indent=2))
    else:
        print(f"Unknown action: {action}. Use 'chunk_embed', 'extract_judges', or 'judge_chunk_embed'.")
