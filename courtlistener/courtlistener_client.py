#!/usr/bin/env python3
"""CourtListener API Client for Georgia Family Court Cases.
Searches for cases containing "alienation" (parental alienation) and stores
in a GA County / Judge / Date RAG structure.
"""
from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime
from pathlib import Path

import requests

# CourtListener API v4 (recommended)
BASE_URL = "https://www.courtlistener.com/api/rest/v4"
STORAGE_BASE_URL = "https://storage.courtlistener.com"

# Georgia courts with case law opinions (family/custody cases often in these)
# court_id:ga = Georgia Supreme Court; court_id:gactapp = Georgia Court of Appeals
# (gact returns 0 results on CourtListener - use ga)
GEORGIA_COURTS = [
    "ga",        # Georgia Supreme Court
    "gactapp",   # Georgia Court of Appeals
]

# State → appellate court_ids (Supreme Court + Court of Appeals)
# Extend as needed; see https://www.courtlistener.com/help/api/jurisdictions/
# Pass courts explicitly in search_opinions() if your state isn't mapped.
STATE_COURTS: dict[str, list[str]] = {
    "GA": ["ga", "gactapp"],
    "NC": ["ncct", "ncctapp"],
    "FL": ["flct", "flctapp"],
    "TX": ["txct", "txctapp"],
}

# Default county for statewide appellate courts (Supreme Court, Court of Appeals)
# When court name has no "X County", use this; enables state + county for all cases
STATE_DEFAULT_COUNTY: dict[str, str] = {
    "GA": "Georgia",
    "NC": "North Carolina",
    "FL": "Florida",
    "TX": "Texas",
}


def get_courts_for_state(state: str) -> list[str]:
    """Return CourtListener court_ids for a state. Falls back to GA if unknown."""
    state_upper = (state or "GA").strip().upper()
    return STATE_COURTS.get(state_upper, GEORGIA_COURTS)


class CourtListenerClient:
    def __init__(self, api_token: str | None = None):
        self.api_token = api_token or os.environ.get("COURTLISTENER_API_TOKEN")
        if not self.api_token:
            raise ValueError(
                "API token required. Set COURTLISTENER_API_TOKEN env var or pass api_token."
            )
        self.headers = {
            "Authorization": f"Token {self.api_token}",
            "Content-Type": "application/json",
        }

    def search_opinions(
        self,
        query: str = "alienat*",  # prefix match: alienation, alienated, alienating (excludes "alien")
        courts: list[str] | None = None,
        filed_after: str | None = None,
        filed_before: str | None = None,
        max_results: int = 500,
    ) -> list[dict]:
        """
        Search CourtListener for opinions (case law) matching the query.
        Uses the Search API with type=o (opinions) - appellate opinions/case law only.
        Courts (ga, gactapp, etc.) are appellate; type=o excludes dockets/other docs.
        Use alienat* to match alienation/alienated/alienating but exclude "alien".
        """
        courts = courts or GEORGIA_COURTS
        endpoint = f"{BASE_URL}/search/"

        # Build q with court_id filter (fielded search) so we only get GA courts
        court_filter = " OR ".join(f"court_id:{c}" for c in courts)
        q_with_courts = f"({query}) AND ({court_filter})"

        all_results = []
        cursor = None

        while len(all_results) < max_results:
            params = {
                "q": q_with_courts,
                "type": "o",  # opinions
            }
            if filed_after:
                params["filed_after"] = filed_after
            if filed_before:
                params["filed_before"] = filed_before
            if cursor:
                params["cursor"] = cursor

            # Cursor-based pagination for Search API
            print(f"Fetching page (cursor={'...' + str(cursor)[-20:] if cursor else 'initial'})...")
            response = requests.get(endpoint, headers=self.headers, params=params)

            if response.status_code != 200:
                print(f"Error: {response.status_code}")
                print(response.text[:500])
                break

            data = response.json()
            results = data.get("results", [])

            if not results:
                break

            all_results.extend(results)
            print(f"Retrieved {len(results)} results (total: {len(all_results)})")

            next_url = data.get("next")
            if next_url and "cursor=" in str(next_url):
                cursor = next_url.split("cursor=")[-1].split("&")[0]
            else:
                cursor = None

            if not cursor or len(all_results) >= max_results:
                break

            time.sleep(1)  # Rate limit respect

        return all_results[:max_results]

    def get_opinion(self, opinion_id: int) -> dict | None:
        """Fetch full opinion from the opinions API (includes plain_text, local_path, etc.)."""
        endpoint = f"{BASE_URL}/opinions/{opinion_id}/"
        response = requests.get(endpoint, headers=self.headers)
        if response.status_code != 200:
            return None
        return response.json()

    def get_opinion_text(self, opinion_id: int) -> str | None:
        """Fetch full opinion text from the opinions API."""
        opinion = self.get_opinion(opinion_id)
        if not opinion:
            return None
        return self._extract_text_from_opinion(opinion)

    def _extract_text_from_opinion(self, opinion: dict) -> str:
        """
        Extract usable text from opinion. CourtListener recommends html_with_citations
        as most reliable; fall back to plain_text, html, xml_harvard.
        """
        text = (
            opinion.get("plain_text")
            or opinion.get("html_with_citations")
            or opinion.get("html")
            or opinion.get("xml_harvard", "")
        )
        if not text or not isinstance(text, str):
            return ""
        # Strip HTML tags for a cleaner plain text if we got HTML
        if "<" in text and ">" in text:
            text = re.sub(r"<[^>]+>", " ", text)
            text = re.sub(r"\s+", " ", text).strip()
        return text

    def get_opinion_pdf_url(self, opinion: dict) -> str | None:
        """
        Return the full URL to download the PDF for an opinion, if available.
        Per CourtListener docs: concatenate local_path with https://storage.courtlistener.com/
        """
        local_path = opinion.get("local_path")
        if not local_path or not isinstance(local_path, str) or not local_path.strip():
            return None
        path = local_path.strip()
        if not path.lower().endswith((".pdf", ".PDF")):
            return None
        base = STORAGE_BASE_URL.rstrip("/")
        path = path if path.startswith("/") else f"/{path}"
        return f"{base}{path}"

    def download_pdf(self, local_path: str) -> bytes | None:
        """
        Download PDF from CourtListener storage.
        local_path: from opinion['local_path']; will be concatenated with storage.courtlistener.com
        """
        if not local_path or not local_path.strip():
            return None
        path = local_path.strip()
        base = STORAGE_BASE_URL.rstrip("/")
        path = path if path.startswith("/") else f"/{path}"
        url = f"{base}{path}"
        response = requests.get(url, timeout=60)
        if response.status_code != 200:
            return None
        content_type = response.headers.get("content-type", "")
        if "pdf" not in content_type.lower() and not response.content[:4] == b"%PDF":
            return None
        return response.content

    def extract_rag_metadata(self, result: dict, state: str = "GA") -> dict:
        """
        Extract state, county, judge, date from a search result for RAG storage.
        County: inferred from court name (e.g. "Fulton County") or default for
        statewide appellate courts (Supreme Court, Court of Appeals).
        """
        court = result.get("court", "")
        court_id = result.get("court_id", "")
        judge = result.get("judge") or result.get("panel_names") or []
        if isinstance(judge, list):
            judge = ", ".join(str(j) for j in judge) if judge else "Unknown"
        date_filed = result.get("dateFiled", "") or "unknown"

        state_upper = (state or "GA").strip().upper()
        default_county = STATE_DEFAULT_COUNTY.get(state_upper, state_upper)

        # Infer county from court name (e.g. "Fulton County Superior Court")
        county = default_county
        county_match = re.search(
            r"([A-Za-z\s]+)\s+County", court, re.IGNORECASE
        )
        if county_match:
            county = county_match.group(1).strip()

        return {
            "county": county,
            "court": court,
            "court_id": court_id,
            "judge": judge,
            "date_filed": date_filed,
            "case_name": result.get("caseName", ""),
            "case_name_full": result.get("caseNameFull", ""),
            "cluster_id": result.get("cluster_id"),
            "docket_id": result.get("docket_id"),
            "docket_number": result.get("docketNumber", ""),
            "citation": result.get("citation", []),
        }
