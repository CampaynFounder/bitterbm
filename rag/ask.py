"""RAG ask: retrieve relevant chunks, then answer with LLM.
Supports OpenAI or Anthropic via provider param or RAG_LLM_PROVIDER env (openai | anthropic).
"""
from __future__ import annotations

import os
from typing import Literal, Optional

from .retrieve import retrieve

RAG_LLM_PROVIDER_DEFAULT = "anthropic"
OPENAI_DEFAULT_MODEL = "gpt-4o"
ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-20250514"
SYSTEM_PROMPT = """You are a legal research assistant for family law and custody matters. Use the provided case excerpts to answer the user's question.

Your response should:
1. Summarize the key findings from the excerpts that relate to the question (e.g., alienation, custody factors, court reasoning).
2. Cite cases by name and date (e.g., "In Baskin v. Hale (2016), the court found...").
3. When the user shares their situation, compare it to relevant cases (e.g., "This is similar to [Case Name] because...").
4. Avoid saying the excerpts "do not discuss" the topic when they clearly mention alienation, custody disputes, or related issues—instead, summarize what the excerpts do say.
5. End with a "**Things you may need to prove**" section: a bulleted list of specific factors, behaviors, and types of evidence that courts relied on in the cited cases. Extract only from the excerpts—e.g., "Lack of cooperation / inability to co-parent," "Child expresses unjustified hostility toward the other parent," "Expert testimony (evaluator, therapist)," "Guardian ad litem reports," "Documented interference with visitation," "Credibility of testimony." Organize into categories if helpful (Behaviors, Evidence types, Court considerations). Keep bullets concise and actionable.

Base your answer only on the provided excerpts. If excerpts are truly unrelated, say so briefly."""


def _format_context(chunks: list[dict]) -> str:
    parts = []
    for i, c in enumerate(chunks, 1):
        text = (c.get("chunk_text") or "").strip()
        case = c.get("case_name", "Unknown")
        court = (c.get("metadata") or {}).get("court", "")
        date = c.get("date_filed", "")
        if not text:
            continue
        parts.append(f"[{i}] {case} ({court}, {date})\n{text}")
    return "\n\n---\n\n".join(parts) if parts else "(No relevant cases found.)"


def _call_openai(prompt: str, model: str) -> str:
    from openai import OpenAI
    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    resp = client.chat.completions.create(
        model=model,
        max_tokens=1024,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
    )
    return (resp.choices[0].message.content or "").strip()


def _call_anthropic(prompt: str, model: str) -> str:
    import anthropic
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    msg = client.messages.create(
        model=model,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    return (msg.content[0].text if msg.content else "").strip()


def ask(
    question: str,
    state: Optional[str] = None,
    top_k: int = 10,
    provider: Literal["openai", "anthropic"] | None = None,
    model: Optional[str] = None,
    debug_retrieve: bool = False,
) -> dict:
    """
    RAG: retrieve relevant case chunks, then answer the question with the LLM.
    state: filter retrieval to this state (e.g. 'GA'); None = all states.
    top_k: number of chunks to retrieve (default 10).
    provider: 'openai' or 'anthropic'; default from RAG_LLM_PROVIDER env, else 'anthropic'.
    model: override model (e.g. gpt-4o, claude-sonnet-4-20250514); default per provider.
    debug_retrieve: if True, include retrieved chunks in response for inspection.
    Returns: answer, sources, and optionally retrieved_chunks when debug_retrieve=True.
    """
    prov = (provider or os.environ.get("RAG_LLM_PROVIDER") or RAG_LLM_PROVIDER_DEFAULT).lower()
    if prov not in ("openai", "anthropic"):
        prov = RAG_LLM_PROVIDER_DEFAULT

    # Auto keyword boost when question is about alienation
    keyword_filter = "alienat" if "alienat" in question.lower() else None
    chunks = retrieve(question, state=state, top_k=top_k, keyword_filter=keyword_filter)
    context = _format_context(chunks)
    # Deduplicate sources by (case_name, date_filed)
    seen = set()
    sources = []
    for c in chunks:
        key = (c.get("case_name"), c.get("date_filed"))
        if key not in seen:
            seen.add(key)
            sources.append({"case_name": c.get("case_name"), "county": c.get("county"), "date_filed": c.get("date_filed")})
    prompt = f"Case excerpts:\n\n{context}\n\nQuestion: {question}"

    model_name = model or os.environ.get("RAG_LLM_MODEL")
    if prov == "openai":
        answer = _call_openai(prompt, model_name or OPENAI_DEFAULT_MODEL)
    else:
        answer = _call_anthropic(prompt, model_name or ANTHROPIC_DEFAULT_MODEL)

    out: dict = {"answer": answer, "sources": sources}
    if debug_retrieve:
        out["retrieved_chunks"] = [
            {"case_name": c.get("case_name"), "date_filed": c.get("date_filed"), "similarity": c.get("similarity"), "chunk_preview": (c.get("chunk_text") or "")[:400]}
            for c in chunks
        ]
    return out
