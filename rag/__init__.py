"""RAG pipeline: chunk, embed, retrieve, ask.
Uses Supabase pgvector with state filtering (Option B: single RAG, filter by state).
"""
from .chunk_embed import chunk_text, run_chunk_embed
from .retrieve import retrieve
from .ask import ask

__all__ = ["chunk_text", "run_chunk_embed", "retrieve", "ask"]
