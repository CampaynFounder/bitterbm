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

# Georgia courts with case law opinions (family/custody cases often in these)
GEORGIA_COURTS = [
    "gact",      # Georgia Supreme Court
    "gactapp",   # Georgia Court of Appeals
]


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
        query: str = "alienation",
        courts: list[str] | None = None,
        filed_after: str | None = None,
        filed_before: str | None = None,
        max_results: int = 500,
    ) -> list[dict]:
        """
        Search CourtListener for opinions (case law) matching the query.
        Uses the Search API with type=o (opinions).
        """
        courts = courts or GEORGIA_COURTS
        endpoint = f"{BASE_URL}/search/"

        all_results = []
        cursor = None

        while len(all_results) < max_results:
            params = {
                "q": query,
                "type": "o",  # opinions
                "order_by": "-dateFiled",
            }
            if filed_after:
                params["filed_after"] = filed_after
            if filed_before:
                params["filed_before"] = filed_before
            if cursor:
                params["cursor"] = cursor

            # Filter by court: CourtListener frontend uses court_<id>=on
            for court in courts:
                params[f"court_{court}"] = "on"

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

    def get_opinion_text(self, opinion_id: int) -> str | None:
        """Fetch full opinion text from the opinions API."""
        endpoint = f"{BASE_URL}/opinions/{opinion_id}/"
        response = requests.get(endpoint, headers=self.headers)

        if response.status_code != 200:
            return None

        opinion = response.json()
        return opinion.get("plain_text") or opinion.get("html", "")

    def extract_rag_metadata(self, result: dict) -> dict:
        """
        Extract GA County, Judge, Date from a search result for RAG storage.
        County may be inferred from court name or case metadata when available.
        """
        court = result.get("court", "")
        court_id = result.get("court_id", "")
        judge = result.get("judge") or result.get("panel_names") or []
        if isinstance(judge, list):
            judge = ", ".join(str(j) for j in judge) if judge else "Unknown"
        date_filed = result.get("dateFiled", "") or "unknown"

        # Infer county from court name (e.g. "Fulton County Superior Court")
        county = "Georgia"  # Default when no county in court name
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
