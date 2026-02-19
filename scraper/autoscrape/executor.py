"""
runtime/executor.py

Executes a validated workflow schema using Playwright.
Handles unlimited nested table expansion, PDF screenshotting, and DB writes.
Can run locally or be imported by the Modal runner.
"""

import asyncio
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Optional
from playwright.async_api import async_playwright, Page, ElementHandle, BrowserContext
import anthropic


# ─── Database abstraction (swap for your actual DB driver) ──────────────────

class Database:
    """
    Minimal async DB interface.
    Replace with asyncpg, SQLAlchemy async, or whatever fits your stack.
    """
    def __init__(self, config: dict):
        self.config   = config
        self._records = {}   # In-memory fallback for testing

    async def connect(self):
        db_type = self.config.get("type", "memory")
        if db_type == "postgres":
            import asyncpg
            self._pool = await asyncpg.create_pool(os.environ[self.config["connectionEnv"]])
        # else: stay in-memory

    async def upsert(self, table: str, record: dict):
        db_type = self.config.get("type", "memory")
        if db_type == "postgres" and hasattr(self, "_pool"):
            cols        = list(record.keys())
            vals        = list(record.values())
            placeholders = ", ".join(f"${i+1}" for i in range(len(cols)))
            col_str     = ", ".join(cols)
            conflict_id = self.config.get("conflictKey", cols[0])
            updates     = ", ".join(f"{c}=EXCLUDED.{c}" for c in cols if c != conflict_id)
            sql = (
                f"INSERT INTO {table} ({col_str}) VALUES ({placeholders}) "
                f"ON CONFLICT ({conflict_id}) DO UPDATE SET {updates}"
            )
            async with self._pool.acquire() as conn:
                await conn.execute(sql, *vals)
        else:
            key = f"{table}:{record.get(list(record.keys())[0])}"
            self._records[key] = record
            print(f"    [DB] {table} ← {json.dumps(record)[:120]}")

    async def close(self):
        if hasattr(self, "_pool"):
            await self._pool.close()


# ─── Wait Strategy Executor ─────────────────────────────────────────────────

class WaitExecutor:
    def __init__(self, page: Page):
        self.page = page

    async def wait(self, strategy: dict, context: dict):
        sel     = self._resolve(strategy.get("targetSelector", ""), context)
        timeout = strategy.get("timeout", 5000)

        match strategy.get("type", "selector_appears"):
            case "dom_mutation" | "selector_appears":
                if sel:
                    await self.page.wait_for_selector(sel, state="visible", timeout=timeout)

            case "selector_hidden":
                if sel:
                    await self.page.wait_for_selector(sel, state="hidden", timeout=timeout)

            case "network_idle":
                await self.page.wait_for_load_state("networkidle", timeout=timeout)

            case "modal_open":
                if sel:
                    await self.page.wait_for_selector(sel, state="visible", timeout=timeout)
                await self.page.wait_for_timeout(strategy.get("animationDelay", 300))

            case "url_change":
                pattern = strategy.get("urlPattern", ".*")
                await self.page.wait_for_url(re.compile(pattern), timeout=timeout)

            case "fixed_delay":
                await self.page.wait_for_timeout(strategy.get("ms", 1000))

    def _resolve(self, template: str, context: dict) -> str:
        for k, v in context.items():
            template = template.replace(f"{{{{{k}}}}}", str(v or ""))
        return template


# ─── Core Executor ──────────────────────────────────────────────────────────

class WorkflowExecutor:
    def __init__(self, schema: dict, params: dict = {}, db_config: dict = None):
        self.schema     = schema
        self.params     = params
        self.db         = Database(db_config or schema.get("db", {"type": "memory"}))
        self.context: BrowserContext = None
        self.page: Page = None
        self.waiter: WaitExecutor = None
        self.stats      = {"rows": 0, "pdfs": 0, "db_writes": 0, "errors": 0}

    async def run(self, headless: bool = True):
        await self.db.connect()

        async with async_playwright() as pw:
            browser       = await pw.chromium.launch(headless=headless)
            self.context  = await browser.new_context()
            self.page     = await self.context.new_page()
            self.waiter   = WaitExecutor(self.page)

            base_context  = {**self.params, "env": {k: v for k, v in os.environ.items()}}

            for step in self.schema.get("steps", []):
                print(f"\n  ▶ Step: {step.get('id')} ({step.get('type')})")
                await self._execute_step(step, base_context)

            await browser.close()

        await self.db.close()
        self._print_summary()

    async def _execute_step(self, step: dict, context: dict):
        match step.get("type"):
            case "navigate":
                await self.page.goto(self._resolve(step["url"], context), wait_until="domcontentloaded")

            case "form_fill":
                await self._form_fill(step, context)

            case "date_range":
                await self._date_range(step, context)

            case "checkbox_group":
                await self._checkbox_group(step, context)

            case "click":
                sel = self._resolve(step["selector"], context)
                await self.page.click(sel)
                if step.get("waitStrategy"):
                    await self.waiter.wait(step["waitStrategy"], context)

            case "row_crawler":
                await self._row_crawler(step, context)

            case _:
                print(f"    [WARN] Unknown step type: {step.get('type')}")

    # ── Form Steps ──────────────────────────────────────────────────────────

    async def _form_fill(self, step: dict, context: dict):
        for field in step.get("fields", []):
            sel = field["selector"]
            val = self._resolve(field["value"], context)
            await self.page.fill(sel, val)
            print(f"    ✏️  Filled {sel}")

        if step.get("submit"):
            await self.page.click(step["submit"])
            await self.page.wait_for_load_state("domcontentloaded")
            print(f"    ✅ Submitted")

    async def _date_range(self, step: dict, context: dict):
        for endpoint in ["from", "to"]:
            cfg = step.get(endpoint)
            if cfg:
                val = self._resolve(cfg["value"], context)
                await self.page.fill(cfg["selector"], val)
                print(f"    📅 Set {endpoint} date: {val}")

    async def _checkbox_group(self, step: dict, context: dict):
        for cb in step.get("checkboxes", []):
            sel     = cb["selector"]
            checked = cb.get("checked", True)
            is_now  = await self.page.is_checked(sel)
            if is_now != checked:
                await self.page.click(sel)
            label = cb.get("label", sel)
            icon  = "☑" if checked else "☐"
            print(f"    {icon} {label}")

    # ── Row Crawler (recursive heart) ────────────────────────────────────────

    async def _row_crawler(self, step: dict, context: dict):
        """
        Handles pagination at the current level, then delegates to _crawl_page.
        """
        page_num = 0
        while True:
            page_num += 1
            print(f"    📄 Page {page_num}")
            await self._crawl_page(step, context)

            pagination = step.get("pagination")
            if not pagination:
                break

            stop_sel  = pagination.get("stopWhen")
            next_sel  = pagination["nextButton"]

            stop_el = await self.page.query_selector(stop_sel) if stop_sel else None
            next_el = await self.page.query_selector(next_sel)

            if stop_el or not next_el:
                break

            if pagination.get("resetExpandState"):
                await self._collapse_all_in_step(step)

            await next_el.click()
            await self.page.wait_for_load_state("domcontentloaded")
            await self.page.wait_for_timeout(500)

    async def _crawl_page(self, step: dict, inherited_context: dict):
        row_sel = step["rowSelector"]
        rows    = await self.page.query_selector_all(row_sel)
        print(f"    🔢 Found {len(rows)} rows")

        for row_index, row in enumerate(rows):
            captured = await self._capture_from_row(row, step.get("capture", []), inherited_context)
            row_context = {
                **inherited_context,
                "row_index": row_index,
                **captured,
            }

            expand = step.get("expand")
            then   = step.get("then")

            if expand:
                await self._expand_and_recurse(row, row_context, expand, depth=0)
            elif then:
                await self._execute_terminal(row_context, then)

            self.stats["rows"] += 1

    async def _expand_and_recurse(
        self,
        row: ElementHandle,
        context: dict,
        expand_config: dict,
        depth: int,
    ):
        indent  = "  " * (depth + 2)
        trigger = expand_config["trigger"]
        sub_cfg = expand_config["subTable"]

        # ── Click the expand trigger ────────────────────────────────────────
        trig_sel = self._resolve(trigger["selector"], context)
        trig_el  = await row.query_selector(trig_sel)

        if not trig_el:
            print(f"{indent}⚠️  Expand trigger not found: {trig_sel}")
            return

        print(f"{indent}▼ Expanding row {context.get('row_index')}")
        await trig_el.click()

        # ── Wait for content ─────────────────────────────────────────────────
        wait_strat = trigger.get("waitStrategy", {"type": "fixed_delay", "ms": 600})
        await self.waiter.wait(wait_strat, context)

        # ── Find the revealed container ──────────────────────────────────────
        container_sel = self._resolve(sub_cfg["containerSelector"], context)
        container     = await self.page.query_selector(container_sel)

        if not container:
            print(f"{indent}⚠️  Sub-table container not found: {container_sel}")
            await self._maybe_collapse(row, expand_config, context)
            return

        # ── Crawl sub-rows ──────────────────────────────────────────────────
        sub_rows = await container.query_selector_all(sub_cfg["rowSelector"])
        print(f"{indent}↳ {len(sub_rows)} sub-rows found")

        for sub_index, sub_row in enumerate(sub_rows):
            sub_captured = await self._capture_from_row(
                sub_row, sub_cfg.get("capture", []), context
            )
            sub_context = {
                **context,
                "sub_row_index": sub_index,
                **sub_captured,
            }

            nested_expand = sub_cfg.get("expand")
            nested_then   = sub_cfg.get("then")

            if nested_expand:
                await self._expand_and_recurse(sub_row, sub_context, nested_expand, depth + 1)
            elif nested_then:
                await self._execute_terminal(sub_context, nested_then)

            # after-crawl hook (e.g. close modal between rows)
            after = sub_cfg.get("afterCrawl")
            if after:
                await self._execute_after_crawl(after, sub_context)

        # ── Collapse ────────────────────────────────────────────────────────
        await self._maybe_collapse(row, expand_config, context)

    async def _capture_from_row(
        self,
        row: ElementHandle,
        capture_defs: list,
        context: dict,
    ) -> dict:
        result = {}
        for cap in capture_defs:
            sel  = self._resolve(cap["selector"], context)
            attr = cap.get("attr", "text")
            try:
                el = await row.query_selector(sel)
                if not el:
                    result[cap["field"]] = None
                    continue

                match attr:
                    case "text":
                        result[cap["field"]] = (await el.inner_text()).strip()
                    case "href":
                        result[cap["field"]] = await el.get_attribute("href")
                    case "src":
                        result[cap["field"]] = await el.get_attribute("src")
                    case "value":
                        result[cap["field"]] = await el.input_value()
                    case other:
                        result[cap["field"]] = await el.get_attribute(other)
            except Exception as e:
                result[cap["field"]] = None
                print(f"      [WARN] Capture failed for {cap['field']}: {e}")

        return result

    # ── Terminal Actions ─────────────────────────────────────────────────────

    async def _execute_terminal(self, context: dict, then_config: dict):
        match then_config.get("type"):
            case "open_pdf_and_screenshot":
                await self._handle_pdf(context, then_config)
            case "db_insert":
                await self._db_insert(context, then_config)
            case "navigate_and_scrape":
                await self._navigate_and_scrape(context, then_config)

    async def _handle_pdf(self, context: dict, config: dict):
        url_field   = config.get("urlField")
        url         = context.get(url_field, self._resolve(url_field or "", context))
        output_dir  = self._resolve(config.get("screenshotDir", "./output/{{row_index}}"), context)

        if not url:
            print(f"      [WARN] PDF URL is empty for field: {url_field}")
            return

        print(f"      📄 PDF: {url}")
        os.makedirs(output_dir, exist_ok=True)

        pdf_page = await self.context.new_page()
        try:
            await pdf_page.goto(url, wait_until="load", timeout=30000)
            await pdf_page.wait_for_timeout(1000)  # Let renderer settle

            # Scroll-and-screenshot strategy
            total_height   = await pdf_page.evaluate("document.body.scrollHeight")
            viewport_height = pdf_page.viewport_size["height"] if pdf_page.viewport_size else 768
            scroll_y, pg_n = 0, 0

            while scroll_y <= total_height:
                await pdf_page.evaluate(f"window.scrollTo(0, {scroll_y})")
                await pdf_page.wait_for_timeout(150)
                path = f"{output_dir}/page_{pg_n:03d}.png"
                await pdf_page.screenshot(path=path, full_page=False)
                scroll_y  += viewport_height
                pg_n      += 1
                if pg_n > 100:   # Safety cap
                    break

            print(f"      📸 {pg_n} screenshots → {output_dir}")
            self.stats["pdfs"] += 1

        except Exception as e:
            print(f"      [ERROR] PDF failed: {e}")
            self.stats["errors"] += 1
        finally:
            await pdf_page.close()

        # DB write
        if "db" in config:
            db_ctx = {**context, "screenshotDir": output_dir}
            record = {k: self._resolve(str(v), db_ctx) for k, v in config["db"]["record"].items()}
            await self.db.upsert(config["db"]["table"], record)
            self.stats["db_writes"] += 1

    async def _db_insert(self, context: dict, config: dict):
        record = {k: self._resolve(str(v), context) for k, v in config.get("record", {}).items()}
        await self.db.upsert(config["table"], record)
        self.stats["db_writes"] += 1

    async def _navigate_and_scrape(self, context: dict, config: dict):
        url = self._resolve(config.get("url", ""), context)
        print(f"      🌐 Navigate: {url}")
        await self.page.goto(url, wait_until="domcontentloaded")

        if config.get("subSteps"):
            for sub in config["subSteps"]:
                await self._execute_step(sub, context)

        if config.get("goBack", True):
            await self.page.go_back()

    async def _execute_after_crawl(self, after: dict, context: dict):
        match after.get("type"):
            case "click":
                sel = self._resolve(after["selector"], context)
                try:
                    await self.page.click(sel)
                    await self.page.wait_for_timeout(300)
                except:
                    pass
            case "go_back":
                await self.page.go_back()
                await self.page.wait_for_load_state("domcontentloaded")

    async def _maybe_collapse(self, row: ElementHandle, expand_config: dict, context: dict):
        collapse = expand_config.get("collapse")
        if collapse and collapse.get("after") == "subtable_crawl_complete":
            sel = self._resolve(collapse["selector"], context)
            try:
                el = await row.query_selector(sel)
                if el:
                    await el.click()
                    await self.page.wait_for_timeout(200)
            except:
                pass

    async def _collapse_all_in_step(self, step: dict):
        collapse = step.get("expand", {}).get("collapse", {})
        if collapse:
            els = await self.page.query_selector_all(collapse["selector"])
            for el in els:
                try:
                    await el.click()
                    await self.page.wait_for_timeout(80)
                except:
                    pass

    # ── Utilities ─────────────────────────────────────────────────────────────

    def _resolve(self, template: str, context: dict) -> str:
        if not isinstance(template, str):
            return str(template or "")
        # Handle {{env.VAR}} separately
        template = re.sub(
            r'\{\{env\.(\w+)\}\}',
            lambda m: os.environ.get(m.group(1), ""),
            template
        )
        for k, v in context.items():
            if isinstance(k, str):
                template = template.replace(f"{{{{{k}}}}}", str(v or ""))
        return template

    def _print_summary(self):
        print("\n" + "═" * 50)
        print(f"  ✅ Run complete")
        print(f"     Rows processed : {self.stats['rows']}")
        print(f"     PDFs captured  : {self.stats['pdfs']}")
        print(f"     DB writes      : {self.stats['db_writes']}")
        print(f"     Errors         : {self.stats['errors']}")
        print("═" * 50)


# ─── Entry point ────────────────────────────────────────────────────────────

async def main():
    if len(sys.argv) < 2:
        print("Usage: python executor.py schema.json [params.json]")
        sys.exit(1)

    schema_path = sys.argv[1]
    params_path = sys.argv[2] if len(sys.argv) > 2 else None

    with open(schema_path) as f:
        schema = json.load(f)

    params = {}
    if params_path:
        with open(params_path) as f:
            params = json.load(f)

    executor = WorkflowExecutor(schema, params)
    await executor.run(headless="--headed" not in sys.argv)


if __name__ == "__main__":
    asyncio.run(main())
