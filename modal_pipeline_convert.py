"""
Modal app: codegen conversion only (Option A).
Exposes POST /pipeline/convert-codegen for Cloudflare PIPELINE_CONVERT_URL.

Deploy from repo root:
    modal deploy modal_pipeline_convert.py

Then set in Cloudflare Pages → Environment variables:
    PIPELINE_CONVERT_URL = https://<your-username>--bitterbm-pipeline-convert-pipeline-convert-codegen.modal.run

(Use the URL Modal prints after deploy; path is /pipeline/convert-codegen.)
"""

import modal
import re
from typing import List, Dict, Optional

app = modal.App("bitterbm-pipeline-convert")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("fastapi", "uvicorn[standard]", "pydantic")
)


class CodegenConverter:
    """
    Converts Playwright codegen output to structured config.
    Inlined from scraper/pipeline/codegen_converter.py so Modal needs no mount.
    """

    def __init__(self, code: str):
        self.code = code
        self.lines = code.strip().split("\n")
        self.steps: List[Dict] = []
        self.current_iframe: Optional[str] = None

    def convert(self) -> Dict:
        self._parse_code()
        return {
            "navigation_steps": self._extract_navigation_steps(),
            "search_form": self._extract_search_form(),
            "results_table": self._extract_results_table(),
            "extraction_rules": self._extract_extraction_rules(),
        }

    def _parse_code(self) -> None:
        for line in self.lines:
            line = line.strip()
            if line.startswith("import") or line.startswith("def") or line.startswith("from"):
                continue
            if "page." in line or "locator" in line:
                step = self._parse_line(line)
                if step:
                    self.steps.append(step)

    def _parse_line(self, line: str) -> Optional[Dict]:
        if ".content_frame" in line:
            self.current_iframe = self._extract_iframe_selector(line)
        if ".goto(" in line:
            url = re.search(r'\.goto\(["\'](.+?)["\']', line)
            if url:
                return {"type": "navigate", "url": url.group(1)}
        elif ".fill(" in line:
            selector = self._extract_selector(line)
            value_match = re.search(r'\.fill\(["\'](.+?)["\']\)', line)
            if selector and value_match:
                return {"type": "fill", "selector": selector, "value": value_match.group(1), "iframe": self.current_iframe}
        elif ".click()" in line:
            selector = self._extract_selector(line)
            if selector:
                return {"type": "click", "selector": selector, "iframe": self.current_iframe}
        elif ".check()" in line:
            selector = self._extract_selector(line)
            if selector:
                return {"type": "check", "selector": selector, "iframe": self.current_iframe}
        elif "wait_for_timeout" in line:
            timeout = re.search(r"wait_for_timeout\((\d+)\)", line)
            if timeout:
                return {"type": "wait", "duration": int(timeout.group(1))}
        elif ".inner_text()" in line or ".text_content()" in line:
            selector = self._extract_selector(line)
            if selector:
                return {"type": "extract", "selector": selector, "iframe": self.current_iframe}
        return None

    def _extract_selector(self, line: str) -> Optional[str]:
        # When line has .content_frame (iframe), use innermost selector (last .locator / .get_by_role / .get_by_text)
        locator_matches = re.findall(r'\.locator\(["\'](.+?)["\']\)', line)
        if locator_matches:
            return locator_matches[-1]
        role_matches = list(re.finditer(r'\.get_by_role\(["\'](.+?)["\'](?:, name=["\'](.+?)["\'])?\)', line))
        if role_matches:
            m = role_matches[-1]
            role, name = m.group(1), (m.group(2) or "")
            return f'[role="{role}"][name*="{name}"]'
        text_matches = re.findall(r'\.get_by_text\(["\'](.+?)["\']\)', line)
        if text_matches:
            return f':text("{text_matches[-1]}")'
        return None

    def _extract_iframe_selector(self, line: str) -> Optional[str]:
        match = re.search(r'\.locator\(["\'](iframe[^"\']*)["\']\)', line)
        if match:
            return match.group(1)
        return "iframe"

    def _extract_navigation_steps(self) -> List[Dict]:
        nav_steps = []
        for step in self.steps:
            if step["type"] in ["navigate", "fill", "click", "check", "wait"]:
                nav_steps.append(step)
            if step["type"] == "click" and "tr:nth-child" in step.get("selector", ""):
                break
        return nav_steps

    def _extract_search_form(self) -> Dict:
        form_fields: Dict = {}
        for step in self.steps:
            if step["type"] == "fill":
                sel, val = step["selector"], step.get("value", "")
                if "search" in sel.lower() or "party" in sel.lower() or "name" in sel.lower():
                    form_fields["party_name"] = sel
                elif "from" in sel.lower() or "start" in sel.lower():
                    form_fields["date_from"] = sel
                elif "to" in sel.lower() or "end" in sel.lower():
                    form_fields["date_to"] = sel
        for step in self.steps:
            if step["type"] == "click":
                sel = step.get("selector", "")
                if "search" in sel.lower() or "submit" in sel.lower():
                    form_fields["search_button"] = sel
                    break
        return form_fields

    def _extract_results_table(self) -> Dict:
        for step in self.steps:
            if step["type"] == "click" and "tr:nth-child" in step.get("selector", ""):
                return {
                    "table_selector": "table",
                    "row_selector": "tbody tr",
                    "iframe": step.get("iframe"),
                }
        return {}

    def _extract_extraction_rules(self) -> Dict:
        rules: Dict = {}
        column_clicks = []
        for step in self.steps:
            if step["type"] == "click" and "td:nth-child" in step.get("selector", ""):
                m = re.search(r"td:nth-child\((\d+)\)", step["selector"])
                if m:
                    column_clicks.append(int(m.group(1)))
        if 1 in column_clicks:
            rules["case_number"] = {"selector": "td:nth-child(1)", "type": "text"}
        if 2 in column_clicks:
            rules["parties"] = {"selector": "td:nth-child(2)", "type": "text"}
        if 5 in column_clicks:
            rules["case_type_code"] = {"selector": "td:nth-child(5)", "type": "text"}
        if 6 in column_clicks:
            rules["case_type_desc"] = {"selector": "td:nth-child(6)", "type": "text"}
        if 8 in column_clicks:
            rules["judge"] = {"selector": "td:nth-child(8)", "type": "text"}
        for step in self.steps:
            sel = step.get("selector", "")
            if step["type"] == "click" and ("img" in sel or "icon" in sel) and ("add.png" in sel or "expand" in sel):
                rules["has_nested_table"] = True
                rules["expand_icon"] = {"selector": sel}
                break
        for step in self.steps:
            if step["type"] == "click" and "a" in step.get("selector", ""):
                rules["pdf_links"] = {"selector": 'a[href*=".pdf"], a[href*="document"]', "type": "href"}
                break
        return rules


@app.function(image=image, allow_concurrent_inputs=100)
@modal.asgi_app()
def pipeline_convert_codegen():
    """ASGI app: POST /pipeline/convert-codegen."""
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel

    web = FastAPI(title="Pipeline Convert Codegen")
    web.add_middleware(
        CORSMiddleware,
        allow_origins=["https://bitterbm.com", "http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    class ConvertBody(BaseModel):
        code: str
        county_id: Optional[str] = None
        config_type: Optional[str] = None

    @web.post("/pipeline/convert-codegen")
    async def convert_codegen(body: ConvertBody):
        try:
            converter = CodegenConverter(body.code)
            config = converter.convert()
            return {
                "success": True,
                "config": config,
                "needs_review": [
                    "extraction_rules",
                    "search_form field mappings",
                    "results_table structure",
                ],
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @web.get("/")
    async def root():
        return {"service": "bitterbm-pipeline-convert", "status": "running"}

    return web
