"""GA County / Judge / Date RAG Storage.
Organizes CourtListener cases for retrieval by jurisdiction and decision maker.
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any


def safe_filename(s: str) -> str:
    """Convert string to filesystem-safe filename."""
    s = re.sub(r"[^\w\s\-.]", "", s)
    s = re.sub(r"\s+", "_", s)
    return s[:100] if s else "unknown"


class RAGStorage:
    """
    Stores case documents in a State / County / Judge / Date hierarchy.
    Structure: rag/{state}/{county}/{judge}/{date}/
    """

    def __init__(self, base_dir: str | Path = "rag", state: str = "GA"):
        self.base_dir = Path(base_dir) / (state or "GA").strip().upper()

    def _path_for(self, county: str, judge: str, date: str) -> Path:
        county_safe = safe_filename(county)
        judge_safe = safe_filename(judge)
        date_safe = safe_filename(date)
        return self.base_dir / county_safe / judge_safe / date_safe

    def store_case(
        self,
        metadata: dict,
        text: str | None = None,
        raw_result: dict | None = None,
    ) -> Path:
        """
        Store a case in the RAG structure.
        metadata: dict from extract_rag_metadata()
        text: full opinion text (optional)
        raw_result: raw API result (optional, for debugging)
        """
        county = metadata.get("county", "Georgia")
        judge = metadata.get("judge", "Unknown")
        date = metadata.get("date_filed", "unknown")

        path = self._path_for(county, judge, date)
        path.mkdir(parents=True, exist_ok=True)

        cluster_id = metadata.get("cluster_id", "unknown")
        case_name = metadata.get("case_name", "case")
        filename = f"{safe_filename(case_name)}_{cluster_id}.json"

        doc = {
            "metadata": metadata,
            "text": text,
            "created_at": datetime.utcnow().isoformat() + "Z",
        }
        if raw_result:
            doc["raw"] = raw_result

        filepath = path / filename
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(doc, f, indent=2, default=str)

        return filepath

    def store_text_only(self, metadata: dict, text: str) -> Path:
        """Store plain text for RAG indexing (no raw JSON)."""
        path = self._path_for(
            metadata["county"], metadata["judge"], metadata["date_filed"]
        )
        path.mkdir(parents=True, exist_ok=True)

        cluster_id = metadata.get("cluster_id", "unknown")
        filename = f"{safe_filename(metadata.get('case_name', 'case'))}_{cluster_id}.txt"
        filepath = path / filename

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(f"# {metadata.get('case_name_full', '')}\n\n")
            f.write(f"Court: {metadata.get('court', '')}\n")
            f.write(f"Judge: {metadata.get('judge', '')}\n")
            f.write(f"Date: {metadata.get('date_filed', '')}\n\n")
            f.write(text or "")

        return filepath

    def list_documents(self) -> list[dict[str, Any]]:
        """List all stored documents with metadata for RAG indexing."""
        docs = []
        for json_file in self.base_dir.rglob("*.json"):
            try:
                with open(json_file, encoding="utf-8") as f:
                    doc = json.load(f)
                    doc["_path"] = str(json_file)
                    docs.append(doc)
            except (json.JSONDecodeError, IOError):
                pass
        return docs
