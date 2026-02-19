#!/usr/bin/env python3
"""Modal scraper: run JSON-driven browser flows in headless Playwright.

Exposes a web endpoint for Validate/Run from the admin scraper UI.
Auth: X-Admin-Secret OR Bearer + admin email in ADMIN_EMAILS (via Supabase).

Run: modal run modal_scraper.py
Deploy: modal deploy modal_scraper.py  → use NEXT_PUBLIC_MODAL_SCRAPER_URL
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import uuid
import urllib.parse
from datetime import datetime
from typing import Any, Optional

import modal

app = modal.App("bitterbm-scraper")

playwright_image = modal.Image.debian_slim(python_version="3.11").run_commands(
    "apt-get update",
    "apt-get install -y software-properties-common",
    "apt-add-repository non-free",
    "apt-add-repository contrib",
    "pip install playwright==1.49.0 supabase",
    "playwright install-deps chromium",
    "playwright install chromium",
)

image_web = modal.Image.debian_slim(python_version="3.11").pip_install(
    "starlette", "supabase"
)


def _interpolate(template: str, vars: dict[str, str | int | None]) -> str:
    def repl(m: re.Match) -> str:
        key = m.group(1)
        v = vars.get(key)
        return str(v) if v is not None else f"{{{{{key}}}}}"

    return re.sub(r"\{\{(\w+)\}\}", repl, template)


def _interpolate_obj(obj: Any, vars: dict[str, str | int | None]) -> Any:
    if isinstance(obj, str):
        return _interpolate(obj, vars)
    if isinstance(obj, dict):
        return {k: _interpolate_obj(v, vars) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_interpolate_obj(v, vars) for v in obj]
    return obj


def _supabase_client():
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
    return create_client(url, key)


RESULT_NESTED_TYPES = frozenset(
    (
        "condition_group",
        "click",
        "wait",
        "extract_field",
        "extract_link",
        "extract_pdf_url",
        "extract_to_memory",
        "extract_text",
        "extract_pdf",
        "store_memory",
        "store_row",
    )
)


def _get_nested_step_range(steps: list[dict], start_index: int, loop_type: str) -> int:
    j = start_index + 1
    if loop_type == "for_each_result":
        while j < len(steps) and steps[j].get("type") in RESULT_NESTED_TYPES:
            j += 1
    else:
        while j < len(steps) and steps[j].get("type") != "for_each_option":
            j += 1
    return j


def _execute_flow(
    page,
    flow: dict,
    vars: dict[str, str | int],
    job_id: str,
    flow_id: str | None,
    source_site: str,
    dry_run: bool,
    stop_at_step: int | None,
    on_store_row,
    on_store_pdf_document=None,
    log_fn=None,
):
    """Execute scraper flow using sync Playwright. Returns (rows_stored, error, stopped_at, page_url)."""
    memory: dict[str, str | int] = {}
    geo = flow.get("geographic") or {}
    if geo.get("fromVars"):
        if geo.get("state") is not None:
            memory["state"] = str(geo["state"])
        elif vars.get("state") is not None:
            memory["state"] = str(vars["state"])
        if geo.get("county") is not None:
            memory["county"] = str(geo["county"])
        elif vars.get("county") is not None:
            memory["county"] = str(vars["county"])

    ctx = {
        "vars": {**vars, "job_id": job_id},
        "row": {},
        "memory": memory,
        "current_row": None,
        "current_frame": None,
        "rows_stored": 0,
        "page_num": 1,
        "job_id": job_id,
        "flow_id": flow_id,
        "source_site": source_site,
        "current_option": None,
    }
    steps = flow.get("steps", [])
    i = 0

    def root():
        return ctx.get("current_frame") or page

    def loc(selector: str):
        scope = ctx["current_row"]
        if scope is not None:
            return scope.locator(selector).first
        return root().locator(selector).first

    def execute_step(step: dict, step_idx: int) -> int | dict | None:
        """Returns next index to jump to, or {'break_loop': True} to skip rest of nested block, or None."""
        cfg_raw = step.get("config") or {}
        merged_vars = dict(ctx["vars"])
        if ctx.get("current_option"):
            merged_vars["current_option_value"] = ctx["current_option"]["value"]
            merged_vars["current_option_text"] = ctx["current_option"]["text"]
        cfg = _interpolate_obj(cfg_raw, merged_vars)

        stype = step.get("type", "")

        if stype == "navigate":
            url = _interpolate(cfg.get("url", ""), ctx["vars"])
            log_fn(f"Navigate: {url}")
            page.goto(
                url,
                wait_until=cfg.get("waitUntil", "domcontentloaded"),
                timeout=60_000,
            )

        elif stype == "pause_for_login":
            msg = cfg.get("message", "Manual login")
            log_fn(msg)
            secs = cfg.get("waitSeconds", 120)
            page.wait_for_timeout(secs * 1000)

        elif stype == "switch_frame":
            if cfg.get("selector"):
                ctx["current_frame"] = page.frame_locator(str(cfg["selector"]))
                log_fn(f"Switch to frame: {cfg['selector']}")
            elif cfg.get("name"):
                frame = page.frame(name=str(cfg["name"]))
                if not frame:
                    raise RuntimeError(f'Frame not found: name="{cfg["name"]}"')
                ctx["current_frame"] = frame
                log_fn(f'Switch to frame: name="{cfg["name"]}"')
            elif cfg.get("url"):
                url_pat = str(cfg["url"])
                frame = next((f for f in page.frames if url_pat in f.url), None)
                if not frame:
                    raise RuntimeError(f'Frame not found: url contains "{url_pat}"')
                ctx["current_frame"] = frame
                log_fn(f'Switch to frame: url contains "{url_pat}"')
            else:
                raise RuntimeError("switch_frame requires selector, name, or url")

        elif stype == "switch_frame_main":
            ctx["current_frame"] = None
            log_fn("Switch to main page")

        elif stype == "wait":
            if cfg.get("selector"):
                target = (
                    ctx["current_row"].locator(cfg["selector"]).first
                    if ctx["current_row"]
                    else root().locator(cfg["selector"]).first
                )
                target.wait_for(
                    timeout=cfg.get("timeout", 15000),
                    state=cfg.get("waitUntil", "visible"),
                )
            else:
                page.wait_for_timeout(cfg.get("timeout", 2000))

        elif stype == "fill_field":
            value = _interpolate(cfg.get("value", ""), ctx["vars"])
            target = root().locator(cfg["selector"]).first
            if cfg.get("clearFirst"):
                target.clear()
            if cfg.get("method") == "type":
                target.fill("")
                target.type(value, delay=cfg.get("typeDelay", 50))
            else:
                target.fill(value)
            if cfg.get("pressEnter"):
                target.press("Enter")

        elif stype == "date_range":
            from_val = _interpolate(cfg.get("fromValue", ""), ctx["vars"])
            to_val = _interpolate(cfg.get("toValue", ""), ctx["vars"])
            r = root()
            r.fill(cfg["fromSelector"], from_val)
            r.fill(cfg["toSelector"], to_val)

        elif stype == "select_dropdown":
            value = _interpolate(cfg.get("value", ""), ctx["vars"])
            target = root().locator(cfg["selector"]).first
            sel_by = cfg.get("selectBy", "value")
            if sel_by == "value":
                target.select_option(value=value)
            elif sel_by == "label":
                target.select_option(label=value)
            else:
                target.select_option(index=int(value))

        elif stype == "checkbox":
            target = root().locator(cfg["selector"]).first
            checked = target.is_checked()
            want = cfg.get("state", "checked") == "checked"
            if want and not checked:
                target.check()
            elif not want and checked:
                target.uncheck()

        elif stype == "click":
            target = loc(cfg["selector"])
            if cfg.get("scrollIntoView", True):
                target.scroll_into_view_if_needed()
            target.click(force=bool(cfg.get("force", False)))
            if cfg.get("waitAfter"):
                page.wait_for_timeout(cfg["waitAfter"])
            if cfg.get("waitForSelector"):
                root().locator(cfg["waitForSelector"]).first.wait_for(timeout=15_000)

        elif stype == "for_each_option":
            select = root().locator(cfg["selector"]).first
            options = select.locator("option").all()
            start = 1 if cfg.get("skipFirst") else 0
            end_idx = _get_nested_step_range(steps, step_idx, "for_each_option")

            for idx in range(start, len(options)):
                opt = options[idx]
                val = opt.get_attribute("value") or ""
                txt = (opt.text_content() or "").strip()
                ctx["current_option"] = {"value": val, "text": txt}
                if cfg.get("outputValueVar"):
                    ctx["vars"][cfg["outputValueVar"]] = val
                if cfg.get("outputTextVar"):
                    ctx["vars"][cfg["outputTextVar"]] = txt

                select.select_option(index=idx)
                page.wait_for_timeout(500)

                for j in range(step_idx + 1, end_idx):
                    ctx["current_row"] = None
                    res = execute_step(steps[j], j)
                    if isinstance(res, dict) and res.get("break_loop"):
                        break

            ctx["current_option"] = None
            return end_idx

        elif stype == "for_each_result":
            rows = root().locator(cfg["selector"]).all()
            limit = cfg.get("limit") or 0
            limit = min(limit, len(rows)) if limit > 0 else len(rows)
            log_fn(f"for_each_result: found {len(rows)} rows (processing {limit})")
            end_idx = _get_nested_step_range(steps, step_idx, "for_each_result")

            for idx in range(limit):
                ctx["row"] = {}
                ctx["current_row"] = rows[idx]

                for j in range(step_idx + 1, end_idx):
                    res = execute_step(steps[j], j)
                    if isinstance(res, dict) and res.get("break_loop"):
                        break

            ctx["current_row"] = None
            return end_idx

        elif stype == "condition_group":
            field_id = cfg.get("fieldId", "")
            val = ctx["row"].get(field_id, ctx["vars"].get(field_id, ""))
            op = cfg.get("operator", "not_empty")
            pass_cond = False
            if op == "not_empty":
                if isinstance(val, list):
                    pass_cond = len(val) > 0
                else:
                    pass_cond = bool(str(val).strip() if isinstance(val, str) else val)
            elif op == "equals":
                pass_cond = str(val).strip() == str(cfg.get("value", "")).strip()
            elif op == "contains":
                pass_cond = str(cfg.get("value", "")) in str(val)
            elif op == "matches" and cfg.get("pattern"):
                import re
                pass_cond = bool(re.search(cfg["pattern"], str(val)))
            elif op == "in" and cfg.get("values"):
                pass_cond = str(val).strip() in [str(v) for v in cfg["values"]]
            if not pass_cond:
                log_fn(f"  condition_group: skip ({field_id} {op} failed)")
                return {"break_loop": True}
            log_fn(f"  condition_group: pass ({field_id})")

        elif stype == "extract_to_memory":
            key = cfg.get("key", "")
            mem_key = cfg.get("memoryKey") or key
            cond_field = cfg.get("conditionFieldId")
            cond_val = cfg.get("conditionValue")
            src = ctx["vars"] if cfg.get("source") == "vars" else ctx["row"]
            if cond_field and cond_val is not None:
                check = str(src.get(cond_field) or "").strip()
                if check != str(cond_val).strip():
                    pass
                else:
                    v = src.get(key)
                    if v is not None and v != "":
                        ctx["memory"][mem_key] = str(v)
                        log_fn(f"  extract_to_memory: {mem_key}={str(v)[:40]}")
            else:
                v = src.get(key)
                if v is not None and v != "":
                    ctx["memory"][mem_key] = str(v)
                    log_fn(f"  extract_to_memory: {mem_key}={str(v)[:40]}")

        elif stype == "store_memory":
            keys = cfg.get("keys") or ["state", "county"]
            for k in keys:
                v = ctx["memory"].get(k)
                if v is not None and v != "":
                    ctx["row"][k] = v
            log_fn(f"  store_memory: {', '.join(keys)} -> row")

        elif stype == "extract_pdf":
            pdf_url = ""
            if cfg.get("fieldId"):
                u = ctx["row"].get(cfg["fieldId"])
                pdf_url = u if isinstance(u, str) else (u[0] if isinstance(u, list) and u else "")
            elif cfg.get("selector"):
                tgt = loc(cfg["selector"])
                if tgt.count() > 0:
                    href = tgt.get_attribute("href") or ""
                    if href and not href.startswith("http"):
                        href = urllib.parse.urljoin(page.url, href)
                    pdf_url = href
            if not pdf_url or not on_store_pdf_document:
                if not pdf_url:
                    log_fn("  extract_pdf: no URL found")
            else:
                screenshot_buffer = None
                if cfg.get("screenshot"):
                    try:
                        page.goto(pdf_url, wait_until="domcontentloaded", timeout=15_000)
                        screenshot_buffer = page.screenshot(type="png")
                    except Exception as e:
                        log_fn(f"  extract_pdf: screenshot failed: {e}")
                row_geo = dict(ctx["row"])
                row_geo.setdefault("state", ctx["memory"].get("state"))
                row_geo.setdefault("county", ctx["memory"].get("county"))
                ctx_short = {"job_id": job_id, "flow_id": flow_id, "source_site": source_site}
                on_store_pdf_document(
                    pdf_url=pdf_url,
                    row=row_geo,
                    ctx=ctx_short,
                    screenshot_buffer=screenshot_buffer,
                )
                log_fn(f"  extract_pdf: stored {pdf_url}")

        elif stype == "extract_field":
            target = loc(cfg["selector"])
            count = target.count()
            if count == 0 and cfg.get("required"):
                raise RuntimeError(
                    f"Required field {cfg.get('fieldId')} not found: {cfg.get('selector')}"
                )
            if count > 0:
                attr = cfg.get("attr", "text")
                if attr == "text":
                    value = (target.text_content() or "").strip()
                elif attr == "html":
                    value = (target.inner_html() or "").strip()
                else:
                    value = (target.get_attribute(attr) or "").strip()
                ctx["row"][cfg["fieldId"]] = value
                preview = value[:60] + "…" if len(value) > 60 else value
                log_fn(f"  extract_field {cfg['fieldId']}: {preview}")

        elif stype == "extract_link":
            target = loc(cfg["selector"])
            if target.count() > 0:
                href = target.get_attribute("href") or ""
                if cfg.get("makeAbsolute") and href and not href.startswith("http"):
                    href = urllib.parse.urljoin(page.url, href)
                ctx["row"][cfg["fieldId"]] = href

        elif stype == "extract_pdf_url":
            target = loc(cfg["selector"])
            if target.count() > 0:
                href = target.get_attribute("href") or ""
                if cfg.get("makeAbsolute") and href and not href.startswith("http"):
                    href = urllib.parse.urljoin(page.url, href)
                field_id = cfg.get("fieldId", "pdf_urls")
                arr = ctx["row"].get(field_id)
                if not isinstance(arr, list):
                    arr = []
                if href:
                    arr.append(href)
                ctx["row"][field_id] = arr

        elif stype == "extract_text":
            if cfg.get("selector"):
                target = loc(cfg["selector"])
            else:
                target = root().locator("body")
            if target.count() > 0:
                text = (target.text_content() or "").strip()
                ctx["row"][cfg["fieldId"]] = text

        elif stype == "paginate":
            next_btn = root().locator(cfg["selector"]).first
            if next_btn.count() == 0:
                pass
            elif next_btn.is_disabled():
                pass
            else:
                max_pages = cfg.get("maxPages", 50)
                if ctx["page_num"] >= max_pages:
                    pass
                else:
                    next_btn.click()
                    ctx["page_num"] += 1
                    if cfg.get("waitAfter"):
                        page.wait_for_timeout(cfg["waitAfter"])

        elif stype == "store_row":
            if not ctx["row"]:
                return None
            merged = {**ctx["memory"], **ctx["row"]}
            row = dict(merged)
            col_map = step.get("config") or {}
            col_map = col_map.get("columnMap") or {}
            if col_map:
                mapped = {}
                for k, v in row.items():
                    mapped[col_map.get(k, k)] = v
                row = mapped

            data = {
                **row,
                "job_id": job_id,
                "scraped_at": datetime.utcnow().isoformat() + "Z",
                "source_url": page.url,
            }
            store_cfg = step.get("config") or {}
            if store_cfg.get("sourceSite"):
                data["source_site"] = store_cfg["sourceSite"]
            if store_cfg.get("flowId"):
                data["flow_id"] = store_cfg["flowId"]
            keys = [k for k in data if k not in ("job_id", "scraped_at")]
            log_fn(f"store_row: saving {', '.join(keys)}")
            on_store_row(data, ctx)
            ctx["rows_stored"] += 1
            ctx["row"] = {}

        elif stype == "delay":
            page.wait_for_timeout(cfg.get("ms", 1000))

        else:
            log_fn(f"Unknown step type: {stype}")

        return None

    try:
        while i < len(steps):
            if stop_at_step is not None and i > stop_at_step:
                log_fn(f"Checkpoint: stopped after step {stop_at_step + 1}")
                return (
                    ctx["rows_stored"],
                    None,
                    stop_at_step,
                    page.url,
                )

            step = steps[i]
            result = execute_step(step, i)
            if result is not None:
                i = result
            else:
                i += 1

        return (ctx["rows_stored"], None, None, page.url)

    except Exception as e:
        return (ctx["rows_stored"], str(e), None, page.url)


PDF_BUCKET = "scraped-pdfs"
SCREENSHOT_BUCKET = "scraped-screenshots"


def _run_scraper_impl(
    flow: dict,
    vars: dict,
    flow_id: str | None,
    dry_run: bool,
    stop_at_step: int | None,
) -> dict:
    import urllib.request

    from playwright.sync_api import sync_playwright

    job_id = str(uuid.uuid4())
    source_site = flow.get("name", "scraper")
    logs: list[str] = []
    preview_rows: list[dict] = []
    pdf_documents_stored = 0

    def on_store_pdf_document(
        pdf_url: str,
        row: dict,
        ctx: dict,
        screenshot_buffer: bytes | None = None,
    ):
        nonlocal pdf_documents_stored
        if dry_run:
            return
        sb = _supabase_client()
        attorneys_raw = row.get("attorneys") or row.get("attorney")
        attorneys_arr = (
            attorneys_raw
            if isinstance(attorneys_raw, list)
            else [s.strip() for s in str(attorneys_raw or "").split(",") if s.strip()]
            if isinstance(attorneys_raw, str)
            else [str(attorneys_raw)] if attorneys_raw else []
        )
        state = str(row.get("state") or "")
        county = str(row.get("county") or "")
        state_dir = state or "unknown"
        pdf_id = str(uuid.uuid4())
        pdf_path = f"{state_dir}/{county or 'unknown'}/{pdf_id}.pdf"
        storage_path = None
        screenshot_path = None
        try:
            req = urllib.request.Request(pdf_url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                pdf_bytes = resp.read()
            sb.storage.from_(PDF_BUCKET).upload(
                pdf_path, pdf_bytes, file_options={"content-type": "application/pdf", "upsert": True}
            )
            storage_path = pdf_path
            if screenshot_buffer and len(screenshot_buffer) > 0:
                shot_path = f"{state_dir}/{county or 'unknown'}/{pdf_id}.png"
                sb.storage.from_(SCREENSHOT_BUCKET).upload(
                    shot_path, screenshot_buffer, file_options={"content-type": "image/png", "upsert": True}
                )
                screenshot_path = shot_path
        except Exception as e:
            logs.append(f"extract_pdf store failed: {e}")
            return
        sb.table("pdf_documents").insert(
            {
                "job_id": job_id,
                "flow_id": flow_id,
                "source_site": source_site,
                "source_url": row.get("source_url"),
                "pdf_url": pdf_url,
                "pdf_storage_path": storage_path,
                "screenshot_path": screenshot_path,
                "state": state or None,
                "county": county or None,
                "case_number": row.get("case_number") or row.get("caseNumber"),
                "case_name": row.get("case_name") or row.get("caseName"),
                "court": row.get("court"),
                "judge": row.get("judge"),
                "attorney": row.get("attorney"),
                "attorneys": attorneys_arr if attorneys_arr else None,
                "gal": row.get("gal"),
                "doc_type": row.get("doc_type"),
                "text_content": row.get("text_content") or row.get("textContent"),
                "raw_metadata": row,
                "scraped_at": datetime.utcnow().isoformat() + "Z",
            }
        ).execute()
        pdf_documents_stored += 1

    def on_store_row(data: dict, ctx: dict):
        if dry_run:
            preview_rows.append(dict(data))
            return

        sb = _supabase_client()
        dedup_cols = (flow.get("deduplication") or {}).get("uniqueKeyColumns") or []
        if dedup_cols:
            pairs = []
            for col in dedup_cols:
                val = data.get(col)
                if val is None:
                    val = data.get(col.replace("_", ""))
                if val is not None and val != "":
                    pairs.append((col, val))
            if pairs:
                q = sb.table("scraped_cases").select("id")
                for col, val in pairs:
                    q = q.eq(col, val)
                res = q.limit(1).execute()
                if res.data and len(res.data) > 0:
                    log_fn(f"store_row: skipped duplicate ({', '.join(dedup_cols)})")
                    return

        attorneys_raw = data.get("attorneys") or data.get("attorney")
        if isinstance(attorneys_raw, list):
            attorneys_arr = attorneys_raw
        elif isinstance(attorneys_raw, str):
            attorneys_arr = [s.strip() for s in attorneys_raw.split(",") if s.strip()] if attorneys_raw else []
        else:
            attorneys_arr = [str(attorneys_raw)] if attorneys_raw else []

        mapped = {
            "flow_id": flow_id,
            "source_site": source_site,
            "source_url": data.get("source_url"),
            "case_number": data.get("case_number") or data.get("caseNumber"),
            "case_name": data.get("case_name") or data.get("caseName"),
            "court": data.get("court"),
            "judge": data.get("judge"),
            "attorney": data.get("attorney"),
            "state": data.get("state"),
            "county": data.get("county"),
            "attorneys": attorneys_arr if attorneys_arr else None,
            "gal": data.get("gal"),
            "case_type": data.get("case_type") or data.get("caseType"),
            "case_status": data.get("case_status") or data.get("caseStatus"),
            "date_filed": data.get("date_filed") or data.get("dateFiled"),
            "pdf_urls": data.get("pdf_urls"),
            "text_content": data.get("text_content") or data.get("textContent"),
            "raw_data": data,
            "scraped_at": data.get("scraped_at"),
        }
        sb.table("scraped_cases").insert(mapped).execute()

    def log_fn(msg: str):
        logs.append(msg)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox"],
        )
        try:
            page = browser.new_page(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page.set_viewport_size({"width": 1280, "height": 720})

            rows_stored, error, stopped_at, page_url = _execute_flow(
                page,
                flow,
                vars,
                job_id,
                flow_id,
                source_site,
                dry_run,
                stop_at_step,
                on_store_row,
                on_store_pdf_document,
                log_fn,
            )

            if not dry_run:
                sb = _supabase_client()
                sb.table("scraper_jobs").insert(
                    {
                        "id": job_id,
                        "flow_id": flow_id,
                        "status": "failed" if error else "completed",
                        "vars": vars,
                        "rows_scraped": rows_stored,
                        "error_message": error,
                        "started_at": datetime.utcnow().isoformat() + "Z",
                        "finished_at": datetime.utcnow().isoformat() + "Z",
                    }
                ).execute()

            result = {
                "jobId": job_id,
                "rowsStored": rows_stored,
                "pdfDocumentsStored": pdf_documents_stored,
                "error": error,
                "logs": logs,
            }
            if dry_run:
                result["dryRun"] = True
                result["previewRows"] = preview_rows
            if stopped_at is not None:
                result["stoppedAt"] = stopped_at
                result["pageUrl"] = page_url
            return result

        finally:
            browser.close()


@app.function(
    image=playwright_image,
    secrets=[modal.Secret.from_name("supabase-secret")],
    timeout=600,
)
def run_scraper(
    flow: dict,
    vars: dict | None = None,
    flow_id: str | None = None,
    dry_run: bool = False,
    stop_at_step: int | None = None,
) -> dict:
    """Run a scraper flow. Called by web endpoint and local_entrypoint."""
    return _run_scraper_impl(
        flow,
        vars or {},
        flow_id,
        dry_run,
        stop_at_step,
    )


@app.function(
    image=image_web,
    secrets=[
        modal.Secret.from_name("supabase-secret"),
        modal.Secret.from_name("scraper-trigger"),
    ],
)
@modal.asgi_app()
def trigger_run():
    """HTTP endpoint for admin scraper UI. POST with flow, vars, flowId, dryRun, stopAtStep."""
    from starlette.applications import Starlette
    from starlette.requests import Request
    from starlette.responses import JSONResponse
    from starlette.routing import Route

    ALLOWED_ORIGINS = {"https://bitterbm.com", "http://localhost:3000", "http://127.0.0.1:3000"}

    def cors_headers(req: Request) -> dict:
        origin = req.headers.get("origin", "https://bitterbm.com")
        allow = origin if origin in ALLOWED_ORIGINS else "https://bitterbm.com"
        return {
            "Access-Control-Allow-Origin": allow,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Admin-Secret",
        }

    async def authorize(req: Request) -> bool:
        admin_secret = os.environ.get("ADMIN_SECRET")
        header_secret = req.headers.get("x-admin-secret")
        if admin_secret and header_secret == admin_secret:
            return True

        auth = req.headers.get("authorization", "")
        if not auth.startswith("Bearer "):
            return False
        admin_emails_str = os.environ.get("ADMIN_EMAILS", "")
        admin_emails = [
            e.strip().lower() for e in admin_emails_str.split(",") if e.strip()
        ]
        if not admin_emails:
            return False
        token = auth[7:].strip()
        sb = _supabase_client()
        try:
            resp = sb.auth.get_user(jwt=token)
            if resp and resp.user and getattr(resp.user, "email", None):
                return resp.user.email.lower() in admin_emails
        except Exception:
            pass
        return False

    async def run_endpoint(req: Request):
        headers = cors_headers(req)
        if req.method == "OPTIONS":
            return JSONResponse({}, headers=headers)
        if req.method != "POST":
            return JSONResponse(
                {"error": "Method not allowed"},
                status_code=405,
                headers=headers,
            )

        if not await authorize(req):
            return JSONResponse(
                {"error": "Unauthorized"},
                status_code=401,
                headers=headers,
            )

        try:
            body = await req.json()
        except Exception:
            return JSONResponse(
                {"error": "Invalid JSON body"},
                status_code=400,
                headers=headers,
            )

        flow = body.get("flow")
        if not flow or not flow.get("steps"):
            return JSONResponse(
                {"error": "flow.steps required"},
                status_code=400,
                headers=headers,
            )

        vars_val = body.get("vars") or {}
        flow_id_val = body.get("flowId")
        dry_run_val = bool(body.get("dryRun"))
        stop_at = body.get("stopAtStep")
        stop_at = int(stop_at) if isinstance(stop_at, (int, float)) and stop_at >= 0 else None

        result = await asyncio.to_thread(
            lambda: run_scraper.remote(
                flow=flow,
                vars=vars_val,
                flow_id=flow_id_val,
                dry_run=dry_run_val,
                stop_at_step=stop_at,
            )
        )
        return JSONResponse(result, headers=headers)

    return Starlette(routes=[Route("/", run_endpoint, methods=["POST", "OPTIONS"])])


@app.local_entrypoint()
def main(
    flow_path: str = "scraper-flow.json",
    vars_path: Optional[str] = None,
    dry_run: bool = False,
    stop_at_step: Optional[int] = None,
):
    """Run a scraper flow locally: modal run modal_scraper.py --flow-path flow.json [--vars-path vars.json] [--dry-run]"""
    with open(flow_path) as f:
        flow = json.load(f)
    if "flow" in flow:
        flow = flow["flow"]
    vars_val = {}
    if vars_path:
        with open(vars_path) as f:
            vars_val = json.load(f)
    result = run_scraper.remote(
        flow=flow,
        vars=vars_val,
        flow_id=None,
        dry_run=dry_run,
        stop_at_step=stop_at_step,
    )
    print(json.dumps(result, indent=2))
