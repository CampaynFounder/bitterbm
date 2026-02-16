"""Entity extraction from raw_cases. Same processing patterns as chunk_embed.
Extracts judges, attorneys, experts into their tables and case_participants links.
Judge extraction uses CourtListener data (raw_cases.judge). Attorney/Expert await
PACER, state bar, JurisPro, etc.
"""
from __future__ import annotations

import os
import re
from typing import Optional

# Minimum judge name length to avoid junk
MIN_JUDGE_NAME_LEN = 3
SKIP_JUDGE_NAMES = frozenset({"unknown", "none", ""})


def _supabase_client():
    from supabase import create_client
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
    return create_client(url, key)


def _normalize_judge_name(raw: str) -> list[str]:
    """Split panel names (comma-separated) and normalize. Returns list of valid names."""
    if not raw or not isinstance(raw, str):
        return []
    names = []
    for part in re.split(r"[,;]", raw):
        n = part.strip()
        if len(n) >= MIN_JUDGE_NAME_LEN and n.lower() not in SKIP_JUDGE_NAMES:
            names.append(n)
    return names


def run_extract_judges(state: Optional[str] = None) -> dict:
    """
    Extract judges from raw_cases, upsert into judges, create case_participants links.
    Uses same state filter and pipeline_run logging as chunk_embed.
    state: filter by state (e.g. 'GA'); None = all states.
    Returns: judges_created, judges_updated, case_participants_created, errors.
    """
    sb = _supabase_client()

    query = sb.from_("raw_cases").select("id, cluster_id, judge, court, state, county")
    if state:
        query = query.eq("state", state.strip().upper())
    rows = query.execute().data or []

    # Build judge key -> judge_id map from existing judges
    existing = sb.from_("judges").select("id, name, state").execute().data or []
    key_to_id: dict[tuple[str, str], str] = {}
    for j in existing:
        k = (j["name"].strip().lower(), (j["state"] or "").strip().upper())
        key_to_id[k] = j["id"]

    judges_created = 0
    judges_updated = 0
    case_participants_created = 0
    errors: list[dict] = []

    for row in rows:
        raw_judge = row.get("judge")
        if not raw_judge:
            continue
        names = _normalize_judge_name(str(raw_judge))
        if not names:
            continue

        raw_case_id = row["id"]
        court = row.get("court")
        state_val = (row.get("state") or "GA").strip().upper()
        county = (row.get("county") or "Georgia").strip()

        for name in names:
            key = (name.strip().lower(), state_val)
            if key in key_to_id:
                judge_id = key_to_id[key]
            else:
                try:
                    ins = sb.table("judges").insert({
                        "name": name.strip(),
                        "court": court,
                        "state": state_val,
                        "county": county,
                        "metadata": {"source": "courtlistener"},
                    }).execute()
                    judge_id = ins.data[0]["id"]
                    key_to_id[key] = judge_id
                    judges_created += 1
                except Exception as e:
                    errors.append({"raw_case_id": raw_case_id, "judge": name, "error": str(e)})
                    continue

            # Insert case_participants link (unique index prevents duplicates)
            try:
                sb.table("case_participants").insert({
                    "raw_case_id": raw_case_id,
                    "participant_type": "judge",
                    "participant_id": judge_id,
                    "role": "author",
                    "metadata": {},
                }).execute()
                case_participants_created += 1
            except Exception as e:
                if "duplicate" in str(e).lower() or "unique" in str(e).lower():
                    pass  # Already linked
                else:
                    errors.append({"raw_case_id": raw_case_id, "participant": judge_id, "error": str(e)})

    # Log pipeline run
    try:
        sb.table("pipeline_runs").insert({
            "step": "extract_judges",
            "status": "ok",
            "counts": {
                "judges_created": judges_created,
                "case_participants_created": case_participants_created,
                "errors_count": len(errors),
            },
            "filters": {"state": state} if state else {},
        }).execute()
    except Exception:
        pass

    return {
        "judges_created": judges_created,
        "judges_updated": judges_updated,
        "case_participants_created": case_participants_created,
        "errors": errors,
        "state_filter": state,
    }


def run_extract_attorneys(state: Optional[str] = None) -> dict:
    """
    Extract attorneys from case data. Skeleton: no data source yet (PACER, state bar).
    Same interface as run_extract_judges for pipeline consistency.
    """
    return {
        "attorneys_created": 0,
        "case_participants_created": 0,
        "errors": [],
        "state_filter": state,
        "message": "No attorney data source configured. PACER/state bar integration pending.",
    }


def run_extract_experts(state: Optional[str] = None) -> dict:
    """
    Extract experts (GALs, evaluators) from case data. Skeleton: no data source yet
    (JurisPro, state licensing boards, court transcripts). Same interface for consistency.
    """
    return {
        "experts_created": 0,
        "case_participants_created": 0,
        "errors": [],
        "state_filter": state,
        "message": "No expert data source configured. JurisPro/state boards integration pending.",
    }
