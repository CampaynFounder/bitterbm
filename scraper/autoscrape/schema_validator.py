"""
compiler/schema_validator.py

After schema_compiler generates a schema, this module does a LIVE VALIDATION PASS:
1. Opens the page in a headless browser
2. Tests every CSS selector — confirms it resolves to >= 1 element
3. For expand triggers, simulates the first click and checks if the sub-table appears
4. Uses a second Claude pass to suggest fixes for broken selectors
5. Emits a "validated_schema.json" with confidence scores per-selector
"""

import asyncio
import json
import sys
from playwright.async_api import async_playwright, Page
import anthropic


class SchemaValidator:
    def __init__(self, schema: dict, url: str = None):
        self.schema  = schema
        self.url     = url or schema.get("domain", "")
        self.client  = anthropic.Anthropic()
        self.results = []   # Validation results per selector

    async def validate(self) -> dict:
        print("  🔍 Starting live selector validation...")

        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            page    = await browser.new_page()

            await page.goto(self.url, wait_until="domcontentloaded")
            await page.wait_for_timeout(1000)

            schema_copy = json.loads(json.dumps(self.schema))  # Deep copy

            for step in schema_copy.get("steps", []):
                await self._validate_step(page, step)

            await browser.close()

        # If there are broken selectors, do a repair pass
        broken = [r for r in self.results if not r["valid"]]
        if broken:
            print(f"  ⚠️  {len(broken)} broken selectors — running repair pass...")
            schema_copy = await self._repair_broken_selectors(schema_copy, broken, page)

        schema_copy["_validation"] = {
            "total":   len(self.results),
            "valid":   len([r for r in self.results if r["valid"]]),
            "broken":  len(broken),
            "results": self.results,
        }

        return schema_copy

    async def _validate_step(self, page: Page, step: dict, depth: int = 0):
        prefix = "  " * depth

        step_id   = step.get("id", "?")
        step_type = step.get("type", "?")

        print(f"{prefix}  📋 Validating step: {step_id} ({step_type})")

        if step_type == "form_fill":
            for field in step.get("fields", []):
                await self._check_selector(page, field["selector"], f"{step_id}.field")
            if step.get("submit"):
                await self._check_selector(page, step["submit"], f"{step_id}.submit")

        elif step_type == "checkbox_group":
            for cb in step.get("checkboxes", []):
                await self._check_selector(page, cb["selector"], f"{step_id}.checkbox")

        elif step_type == "date_range":
            if step.get("from"):
                await self._check_selector(page, step["from"]["selector"], f"{step_id}.from")
            if step.get("to"):
                await self._check_selector(page, step["to"]["selector"], f"{step_id}.to")

        elif step_type == "row_crawler":
            await self._validate_row_crawler(page, step, depth)

    async def _validate_row_crawler(self, page: Page, step: dict, depth: int):
        prefix   = "  " * depth
        step_id  = step.get("id", "?")

        # Validate row selector
        row_sel = step.get("rowSelector")
        if row_sel:
            count = await self._check_selector(page, row_sel, f"{step_id}.rows", expect_multiple=True)
            print(f"{prefix}    ↳ Found {count} rows")

        # Validate capture selectors (relative, so we can only check they're valid CSS)
        for cap in step.get("capture", []):
            # Can't fully validate relative selectors without a row context,
            # but we can check they're valid CSS syntax
            await self._check_selector_syntax(cap["selector"], f"{step_id}.capture.{cap['field']}")

        # Validate expand trigger
        expand = step.get("expand")
        if expand:
            trigger = expand.get("trigger", {})
            trig_sel = trigger.get("selector")
            if trig_sel and "{{" not in trig_sel:
                await self._check_selector(page, trig_sel, f"{step_id}.expand.trigger")

            # Try to simulate the expansion on the first row
            if row_sel and trig_sel and "{{" not in trig_sel:
                await self._simulate_expand(page, row_sel, trigger, expand, step_id, prefix)

            # Recurse into subTable
            sub = expand.get("subTable", {})
            if sub.get("rowSelector") and "{{" not in sub.get("containerSelector", ""):
                # Can validate container only if static
                container_sel = sub.get("containerSelector")
                if container_sel:
                    await self._check_selector(page, container_sel, f"{step_id}.subTable.container")

        # Validate pagination
            pagination = step.get("pagination", {})
            if pagination.get("nextButton"):
                await self._check_selector(page, pagination["nextButton"], f"{step_id}.pagination.next",
                                       required=False)

    async def _simulate_expand(
        self, page: Page, row_sel: str, trigger: dict,
        expand: dict, step_id: str, prefix: str
    ):
        """Try clicking the first row's expand trigger and validate the sub-table appears."""
        try:
            rows = await page.query_selector_all(row_sel)
            if not rows:
                return

            first_row = rows[0]
            trig_el = await first_row.query_selector(trigger["selector"])

            if not trig_el:
                self.results.append({
                    "selector": trigger["selector"],
                    "context":  f"{step_id}.expand.trigger (in first row)",
                    "valid":    False,
                    "reason":   "Trigger not found within first row",
                })
                return

            # Click and wait
            await trig_el.click()
            wait_strat = trigger.get("waitStrategy", {})
            target_sel = wait_strat.get("targetSelector", "")

            if target_sel and "{{" not in target_sel:
                try:
                    await page.wait_for_selector(
                        target_sel,
                        state="visible",
                        timeout=wait_strat.get("timeout", 4000)
                    )
                    sub = expand.get("subTable", {})
                    sub_rows = await page.query_selector_all(sub.get("rowSelector", "tr"))
                    count = len(sub_rows)
                    print(f"{prefix}    ✅ Expand simulation: sub-table appeared with {count} rows")
                    self.results.append({
                        "selector": target_sel,
                        "context":  f"{step_id}.expand.waitTarget",
                        "valid":    True,
                        "subRowCount": count,
                    })
                except Exception as e:
                    self.results.append({
                        "selector": target_sel,
                        "context":  f"{step_id}.expand.waitTarget",
                        "valid":    False,
                        "reason":   f"Timed out waiting for sub-table: {e}",
                    })

        except Exception as e:
            print(f"{prefix}    ⚠️  Expand simulation error: {e}")

    async def _check_selector(
        self, page: Page, selector: str,
        context: str, expect_multiple: bool = False, required: bool = True
    ) -> int:
        if not selector or "{{" in selector:
            # Template selectors can't be validated statically
            return -1
        try:
            elements = await page.query_selector_all(selector)
            count    = len(elements)
            valid    = count > 0

            icon = "✅" if valid else "❌"
            mult = f"({count} elements)" if expect_multiple else ""
            print(f"      {icon} {context}: `{selector}` {mult}")

            self.results.append({
                "selector": selector,
                "context":  context,
                "valid":    valid,
                "count":    count,
                "required": required,
            })
            return count

        except Exception as e:
            print(f"      ❌ {context}: `{selector}` — ERROR: {e}")
            self.results.append({
                "selector": selector,
                "context":  context,
                "valid":    False,
                "reason":   str(e),
                "required": required,
            })
            return 0

    async def _check_selector_syntax(self, selector: str, context: str):
        # Basic syntax check — does it parse as CSS?
        try:
            import re
            if re.search(r'[^\w\s\.\#\:\[\]\(\)\-\*\>\+\~\=\^\$\|\"\'%,]', selector):
                self.results.append({"selector": selector, "context": context, "valid": False, "reason": "Suspicious characters"})
            else:
                self.results.append({"selector": selector, "context": context, "valid": True, "note": "syntax-only"})
        except:
            pass

    async def _repair_broken_selectors(self, schema: dict, broken: list, page: Page) -> dict:
        """Use Claude to suggest alternative selectors for broken ones."""
        # Get current page HTML snippet for context
        try:
            html_snippet = await page.evaluate(
                "document.body.innerHTML.slice(0, 15000)"
            )
        except:
            html_snippet = "(unavailable)"

        broken_summary = json.dumps([
            {"selector": r["selector"], "context": r["context"], "reason": r.get("reason", "not found")}
            for r in broken
        ], indent=2)

        prompt = f"""These CSS selectors from an automation schema failed to resolve on the live page.

Page HTML (first 15000 chars):
{html_snippet}

Broken selectors:
{broken_summary}

For each broken selector, suggest a corrected CSS selector that would match the intended element.
Return ONLY a JSON object mapping original_selector → suggested_replacement. Example:
{{
  "#oldId table tr": "table.results tbody tr",
  ".expand-btn": "button[data-action='expand']"
}}
"""
        response = self.client.messages.create(
            model="claude-opus-4-6",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}]
        )

        raw = response.content[0].text.strip()
        raw = raw.replace("```json", "").replace("```", "").strip()

        try:
            replacements = json.loads(raw)
            # Apply replacements throughout schema
            schema_str = json.dumps(schema)
            for old, new in replacements.items():
                schema_str = schema_str.replace(json.dumps(old)[1:-1], json.dumps(new)[1:-1])
            schema = json.loads(schema_str)
            print(f"  🔧 Applied {len(replacements)} selector repairs")
        except Exception as e:
            print(f"  ⚠️  Repair pass failed: {e}")

        return schema


async def validate_schema_file(schema_path: str, output_path: str = None):
    with open(schema_path) as f:
        schema = json.load(f)

    validator      = SchemaValidator(schema)
    validated      = await validator.validate()
    output_path    = output_path or schema_path.replace(".json", "_validated.json")

    with open(output_path, "w") as f:
        json.dump(validated, f, indent=2)

    v = validated.get("_validation", {})
    print(f"\n  ✅ Validation complete: {v.get('valid')}/{v.get('total')} selectors OK")
    print(f"  📝 Validated schema: {output_path}")
    return validated


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python schema_validator.py schema.json [validated_schema.json]")
        sys.exit(1)
    asyncio.run(validate_schema_file(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None))
