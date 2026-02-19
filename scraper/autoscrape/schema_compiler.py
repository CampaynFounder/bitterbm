"""
compiler/schema_compiler.py

Takes a recorded session.json and:
1. Structures the event log into interaction groups
2. Sends to Claude for pattern analysis
3. Emits a validated, runnable workflow schema JSON
"""

import json
import re
import sys
from pathlib import Path
from typing import Optional
import anthropic


SYSTEM_PROMPT = """You are an expert web automation engineer specializing in Playwright and complex enterprise web applications.

You will be given a DOM interaction session log captured from a user navigating a web page.
The log contains:
- initialSnapshot: tables, forms found on first load
- events: ordered list of clicks, form fills, checkboxes, navigation
- snapshots[*].expandPatterns: heuristic candidates for expand/collapse triggers
- mutations: DOM changes that occurred after each click

Your task is to analyze this session and output a COMPLETE workflow schema JSON.

## Output Schema Format

You must output ONLY valid JSON with this structure (no markdown, no explanation):

{
  "domain": "string",
  "description": "string — what this workflow does",
  "confidence": 0.0-1.0,
  "warnings": ["list of potential issues found"],

  "steps": [
    {
      "id": "string",
      "type": "form_fill | date_range | checkbox_group | click | navigate | row_crawler",
      ... (type-specific fields)
    }
  ]
}

## Step Types

### form_fill
{
  "id": "login",
  "type": "form_fill",
  "fields": [
    { "selector": "css", "value": "{{env.VARNAME}}" or "literal" }
  ],
  "submit": "css selector"
}

### date_range
{
  "id": "set_dates",
  "type": "date_range",
  "from": { "selector": "css", "value": "{{params.startDate}}" },
  "to":   { "selector": "css", "value": "{{params.endDate}}" }
}

### checkbox_group
{
  "id": "apply_filters",
  "type": "checkbox_group",
  "checkboxes": [
    { "selector": "css", "checked": true/false, "label": "human label" }
  ]
}

### row_crawler (THE CRITICAL ONE — supports unlimited nesting)
{
  "id": "string",
  "type": "row_crawler",
  "rowSelector": "table tbody tr",
  "capture": [
    { "field": "fieldname", "selector": "td:nth-child(N)", "attr": "text|href|src|value|data-*" }
  ],

  // OPTIONAL — if clicking a row reveals a sub-table:
  "expand": {
    "trigger": {
      "type": "click",
      "selector": "css — the clickable element within the row",
      "waitStrategy": {
        "type": "dom_mutation|selector_appears|selector_hidden|network_idle|modal_open|url_change|fixed_delay",
        "targetSelector": "css — what to wait FOR (use {{row_index}} or {{fieldname}} if dynamic)",
        "timeout": 5000,
        "animationDelay": 300   // only for modal_open
      }
    },
    "subTable": {
      "containerSelector": "css — the container div/section revealed (use {{fieldname}} for dynamic)",
      "rowSelector": "css — rows within the container",
      "capture": [ ... ],

      // CAN NEST AGAIN:
      "expand": { ... },   // another level deep
      // OR terminal action:
      "then": { ... },

      "afterCrawl": {
        "type": "click | go_back",
        "selector": "css"   // for click type
      }
    },
    "collapse": {
      "after": "subtable_crawl_complete",
      "selector": "css — what to click to collapse"
    }
  },

  // OPTIONAL — terminal action at leaf level (no expand):
  "then": {
    "type": "open_pdf_and_screenshot | db_insert | navigate_and_scrape",
    "urlField": "fieldname from capture",
    "screenshotDir": "./output/{{field1}}/{{field2}}",
    "db": {
      "table": "tablename",
      "record": { "col": "{{fieldname}}" }
    }
  },

  // OPTIONAL — if table has multiple pages:
  "pagination": {
    "nextButton": "css",
    "stopWhen": "css — element that indicates last page",
    "resetExpandState": true
  }
}

## Analysis Rules

1. EXPAND PATTERN DETECTION:
   - If a click event is followed by mutations containing new tables → this is an expand trigger
   - The container is the closest parent div of the new table
   - If mutations show aria-expanded changing → the trigger selector is that element
   - If new elements appear with class like "detail-row", "sub-table", "expanded" → it's an accordion

2. SELECTOR ROBUSTNESS:
   - Prefer data-* attributes over positional selectors
   - Use :nth-child() only as last resort
   - If a selector contains dynamic IDs, use {{fieldname}} template variables
   - For row-keyed containers like div[data-row="X"], use {{captured_field}} in the selector

3. NESTED TABLE DEPTH:
   - Analyze ALL expand events in sequence to determine depth
   - If a click inside an already-expanded region reveals more tables → add another expand level
   - Maximum depth detected should be reflected in nested expand blocks

4. PDF DETECTION:
   - Any href ending in .pdf, or navigation to a PDF viewer URL → use open_pdf_and_screenshot
   - The urlField should be the capture field containing the PDF href

5. WAIT STRATEGY SELECTION:
   - Class change (aria-expanded, open/closed classes) → dom_mutation
   - New element appears → selector_appears  
   - Loading spinner disappears → selector_hidden
   - Modal with animation → modal_open with animationDelay
   - Full page navigation → url_change
   - XHR fetch (network tab shows API call) → network_idle (use sparingly)

6. CONFIDENCE SCORING:
   - 0.9+: Clear patterns, stable selectors, all steps confirmed by events
   - 0.7-0.9: Some selectors inferred, minor ambiguity
   - 0.5-0.7: Multiple possible interpretations, needs user review
   - <0.5: Insufficient data, add warnings

Output ONLY the JSON schema. No markdown fences, no explanation text.
"""


class SchemaCompiler:
    def __init__(self, session_path: str, model: str = "claude-opus-4-6"):
        self.session_path = session_path
        self.model        = model
        self.client       = anthropic.Anthropic()

    def compile(self, extra_context: str = "") -> dict:
        print(f"  📂 Loading session: {self.session_path}")
        with open(self.session_path) as f:
            session_data = json.load(f)

        # Build a condensed representation for the LLM
        condensed = self._condense_session(session_data)
        print(f"  📊 Condensed: {len(condensed['events'])} events, {condensed['tableCount']} tables found")

        prompt = self._build_prompt(condensed, extra_context)

        print(f"  🤖 Analyzing with Claude ({self.model})...")
        response = self.client.messages.create(
            model=self.model,
            max_tokens=8000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}]
        )

        raw = response.content[0].text.strip()

        # Strip accidental markdown fences
        raw = re.sub(r'^```json\s*', '', raw)
        raw = re.sub(r'\s*```$', '', raw)

        schema = json.loads(raw)
        self._post_process(schema)
        return schema

    def _condense_session(self, data: dict) -> dict:
        """
        Reduce the session to the most signal-rich parts for the LLM.
        We prioritize: expand events (clicks with mutations), form interactions,
        and table structure — dropping redundant mouse movements.
        """
        condensed = {
            "url":        data["meta"]["url"],
            "events":     [],
            "tableCount": 0,
            "initialTables": [],
        }

        for snap in data.get("snapshots", []):
            session = snap.get("session", {})
            initial = session.get("initialSnapshot", {})

            if initial.get("tables"):
                condensed["initialTables"] = initial["tables"]
                condensed["tableCount"]    = len(initial["tables"])

            events = session.get("events", [])
            snapshots = session.get("snapshots", {})

            for event in events:
                eid = str(event.get("id"))
                snap_data = snapshots.get(eid, {})

                condensed_event = {
                    "id":       event["id"],
                    "type":     event["type"],
                    "selector": event.get("selector"),
                    "text":     event.get("text", "")[:60],
                    "value":    event.get("value"),
                    "label":    event.get("label"),
                    "href":     event.get("href"),
                }

                # Attach mutation summary
                if snap_data.get("newTables"):
                    condensed_event["REVEALED_TABLES"]   = snap_data["newTables"]
                    condensed_event["EXPAND_TRIGGER"]    = True

                if snap_data.get("newElements"):
                    condensed_event["REVEALED_ELEMENTS"] = [
                        {k: v for k, v in el.items() if k in ("selector", "tag", "classes")}
                        for el in snap_data["newElements"]
                    ]

                if snap_data.get("mutationCount", 0) > 0:
                    condensed_event["mutationCount"] = snap_data["mutationCount"]

                condensed["events"].append(condensed_event)

            # Include expand patterns from last snapshot
            if snap.get("expandPatterns"):
                condensed["expandPatternCandidates"] = snap["expandPatterns"][:20]

        return condensed

    def _build_prompt(self, condensed: dict, extra_context: str) -> str:
        parts = [
            f"Target URL: {condensed['url']}",
            "",
            f"Initial tables found on page ({condensed['tableCount']} total):",
            json.dumps(condensed["initialTables"], indent=2),
            "",
            "Heuristic expand/collapse candidates found before any interaction:",
            json.dumps(condensed.get("expandPatternCandidates", []), indent=2),
            "",
            "Recorded interaction events (events marked EXPAND_TRIGGER=true revealed new tables):",
            json.dumps(condensed["events"], indent=2),
        ]

        if extra_context:
            parts += ["", "Additional context from user:", extra_context]

        parts += [
            "",
            "Analyze the above and generate the complete workflow schema JSON.",
            "Pay special attention to EXPAND_TRIGGER events — these define your nested row_crawler expand blocks.",
            "Events with REVEALED_TABLES tell you exactly what sub-table appeared and its structure.",
        ]

        return "\n".join(parts)

    def _post_process(self, schema: dict):
        """Validate and enrich the generated schema."""
        warnings = schema.setdefault("warnings", [])

        if schema.get("confidence", 1.0) < 0.7:
            warnings.append(
                "Low confidence — review selectors manually before running at scale"
            )

        # Walk steps and check for missing waitStrategies
        for step in schema.get("steps", []):
            self._validate_step(step, warnings)

    def _validate_step(self, step: dict, warnings: list):
        if step.get("type") != "row_crawler":
            return

        expand = step.get("expand")
        if expand:
            trigger = expand.get("trigger", {})
            if not trigger.get("waitStrategy"):
                warnings.append(
                    f"Step '{step.get('id')}' expand trigger missing waitStrategy — defaulting to dom_mutation"
                )
                trigger["waitStrategy"] = {
                    "type": "dom_mutation",
                    "targetSelector": "REVIEW_NEEDED",
                    "timeout": 5000
                }

            sub = expand.get("subTable", {})
            self._validate_step(sub, warnings)  # Recurse into nested


def main():
    if len(sys.argv) < 2:
        print("Usage: python schema_compiler.py session.json [output_schema.json] ['extra context']")
        sys.exit(1)

    session_path  = sys.argv[1]
    output_path   = sys.argv[2] if len(sys.argv) > 2 else "schema.json"
    extra_context = sys.argv[3] if len(sys.argv) > 3 else ""

    compiler = SchemaCompiler(session_path)
    schema   = compiler.compile(extra_context)

    with open(output_path, "w") as f:
        json.dump(schema, f, indent=2)

    print(f"\n  ✅ Schema written to: {output_path}")
    print(f"  📋 Confidence: {schema.get('confidence', '?')}")
    if schema.get("warnings"):
        print(f"  ⚠️  Warnings:")
        for w in schema["warnings"]:
            print(f"      • {w}")


if __name__ == "__main__":
    main()
