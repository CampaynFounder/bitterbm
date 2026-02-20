#!/usr/bin/env python3
"""
Phase 1 superset builder: run one search flow, then filter and extract rows from the result table.

Usage:
  # Single combined file (flow + site config):
  python phase1_build.py --config superset-phase1.json [--output superset.json] [--pattern "A%"] [--headless]

  # Separate files:
  python phase1_build.py --flow flow.json --site-config site-config.json [--output superset.json]

Config file (combined) shape: { "flow": { "name": "...", "steps": [...] }, "siteConfig": { ... } }
Site config must include resultTable (tableSelector, rowSelector, primaryId, threshold, optional rowFilter, nestedRowFilters, extractColumns).
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("Install playwright: pip install playwright && playwright install chromium", file=sys.stderr)
    sys.exit(1)


def load_config(config_path=None, flow_path=None, site_config_path=None):
    if config_path:
        with open(config_path, encoding="utf-8") as f:
            data = json.load(f)
        flow = data.get("flow") or {}
        site_config = data.get("siteConfig") or data.get("site_config") or {}
        if not site_config:
            site_config = data
        return flow, site_config
    if flow_path and site_config_path:
        with open(flow_path, encoding="utf-8") as f:
            flow = json.load(f)
        with open(site_config_path, encoding="utf-8") as f:
            site_config = json.load(f)
        return flow, site_config
    raise ValueError("Use --config or both --flow and --site-config")


def interpolate(template, vars_dict):
    if not isinstance(template, str):
        return template
    out = template
    for k, v in vars_dict.items():
        out = out.replace("{{" + k + "}}", str(v))
    return out


def run_flow_steps(page, steps, vars_dict, log):
    """Run a subset of steps (navigate, switch_frame, wait, fill_field, date_range, form_fill, checkbox, click, delay).
    Returns (page, root) where root is the frame or page to use for subsequent locator queries (e.g. result table)."""
    frame = None  # None = page; else Frame or FrameLocator for queries inside that frame

    for i, step in enumerate(steps):
        typ = step.get("type", "")
        cfg = step.get("config") or {}
        # Back-compat: props on step
        if typ == "navigate" and not cfg.get("url") and step.get("url"):
            cfg = { **cfg, "url": step["url"] }
        if typ == "click" and not cfg.get("selector") and step.get("selector"):
            cfg = { **cfg, "selector": step["selector"] }
        if typ == "form_fill" and not cfg.get("fields") and step.get("fields"):
            cfg = { **cfg, "fields": step.get("fields", []), "submit": step.get("submit", cfg.get("submit")) }

        cfg = { k: (interpolate(v, vars_dict) if isinstance(v, str) else v) for k, v in cfg.items() }

        root = frame if frame is not None else page

        try:
            if typ == "navigate":
                url = cfg.get("url") or ""
                if not url:
                    raise ValueError("navigate step missing url")
                log(f"Navigate: {url[:60]}...")
                page.goto(url, wait_until=cfg.get("waitUntil", "domcontentloaded"), timeout=60000)

            elif typ == "switch_frame":
                sel = cfg.get("selector")
                name = cfg.get("name")
                url = cfg.get("url")
                if sel:
                    frame = page.frame_locator(sel)
                    log(f"Switch to frame: {sel}")
                elif name:
                    f = page.frame(name=name)
                    if not f:
                        raise ValueError(f'Frame not found: name="{name}"')
                    frame = f
                    log(f"Switch to frame: name={name}")
                elif url:
                    for f in page.frames:
                        if url in f.url:
                            frame = f
                            log(f"Switch to frame: url contains {url}")
                            break
                    else:
                        raise ValueError(f'Frame not found: url contains "{url}"')
                else:
                    raise ValueError("switch_frame requires selector, name, or url")

            elif typ == "switch_frame_main":
                frame = None
                log("Switch to main page")

            elif typ == "wait":
                sel = cfg.get("selector")
                timeout = int(cfg.get("timeout", 15000))
                if sel:
                    loc = root.locator(sel).first
                    loc.wait_for(state="visible", timeout=timeout)
                else:
                    page.wait_for_timeout(timeout)

            elif typ == "fill_field":
                sel = cfg.get("selector", "")
                value = str(cfg.get("value", ""))
                target = root.locator(sel).first
                if cfg.get("clearFirst", True):
                    target.clear()
                target.fill(value)

            elif typ == "date_range":
                root.fill(cfg.get("fromSelector", ""), str(cfg.get("fromValue", "")))
                root.fill(cfg.get("toSelector", ""), str(cfg.get("toValue", "")))

            elif typ == "form_fill":
                fields = cfg.get("fields") or []
                for f in fields:
                    sel = f.get("selector", "")
                    val = str(f.get("value", ""))
                    if sel:
                        root.locator(sel).first.fill(val)
                submit = cfg.get("submit", "")
                if submit:
                    root.locator(submit).first.click()

            elif typ == "checkbox":
                sel = cfg.get("selector", "")
                state = cfg.get("state", "checked")
                target = root.locator(sel).first
                checked = target.is_checked()
                if state == "checked" and not checked:
                    target.check()
                elif state == "unchecked" and checked:
                    target.uncheck()

            elif typ == "click":
                sel = cfg.get("selector", "")
                if not sel:
                    raise ValueError("click step missing selector")
                target = root.locator(sel).first
                target.scroll_into_view_if_needed()
                target.click()
                wait_after = int(cfg.get("waitAfter", 0))
                if wait_after:
                    page.wait_for_timeout(wait_after)

            elif typ == "delay":
                ms = int(cfg.get("ms", 1000))
                page.wait_for_timeout(ms)

            else:
                log(f"Step {i+1} ({typ}) skipped (not supported in Phase 1)")
        except Exception as e:
            log(f"Step {i+1} ({typ}) failed: {e}")
            raise

    # Return the context to use for result table lookup (frame or page)
    return frame if frame is not None else page


def get_cell_text(locator, primary_id_config):
    """Get text or link attribute from a cell for primaryId or extract."""
    source = primary_id_config.get("source", "column")
    if source == "link":
        link_sel = primary_id_config.get("linkSelector", "a")
        attr = primary_id_config.get("linkAttribute", "href")
        try:
            link = locator.locator(link_sel).first
            return link.get_attribute(attr) or ""
        except Exception:
            return ""
    return (locator.inner_text() or "").strip()


def row_matches_filter(row_locator, row_filter_list, logic, table_selector, row_selector):
    """Evaluate rowFilter conditions (AND/OR + NOT) on a row. Row locator is for one <tr>."""
    if not row_filter_list:
        return True
    results = []
    for f in row_filter_list:
        col_idx = int(f.get("columnIndex", 0))
        op = f.get("operator", "equals")
        val = f.get("value")
        not_flag = f.get("not", False)
        # nth-child is 1-based in CSS; columns are often td:nth-child(1), td:nth-child(2)...
        cell_sel = f"td:nth-child({col_idx + 1}), th:nth-child({col_idx + 1})"
        try:
            cell = row_locator.locator(cell_sel).first
            cell_text = (cell.inner_text() or "").strip()
        except Exception:
            cell_text = ""
        if op == "equals":
            match = cell_text == (val if isinstance(val, str) else str(val))
        else:  # in
            vals = val if isinstance(val, list) else [val]
            match = cell_text in [str(v) for v in vals]
        if not_flag:
            match = not match
        results.append(match)
    if logic == "or":
        return any(results)
    return all(results)


def nested_filter_passes(row_locator, nested_filters):
    """For each nested filter, check selector within row exists/not_exists and includeParentWhen."""
    for nf in (nested_filters or []):
        sel = nf.get("selectorWithinRow", "")
        if not sel:
            continue
        cond = nf.get("condition", "exists")
        include_when = nf.get("includeParentWhen", True)
        try:
            count = row_locator.locator(sel).count
            exists = count > 0
        except Exception:
            exists = False
        if cond == "not_exists":
            matches = not exists
        else:
            matches = exists
        if include_when and not matches:
            return False
        if not include_when and matches:
            return False
    return True


def extract_row_id_and_data(row_locator, result_table, rt):
    """Extract primary id and extractColumns from a row. Returns (id_str, extracted_dict)."""
    primary_id = rt.get("primaryId") or {}
    col_idx = int(primary_id.get("columnIndex", 0))
    cell_sel = f"td:nth-child({col_idx + 1}), th:nth-child({col_idx + 1})"
    try:
        cell = row_locator.locator(cell_sel).first
        id_val = get_cell_text(cell, primary_id)
    except Exception:
        id_val = ""
    extracted = {}
    for ec in (rt.get("extractColumns") or []):
        idx = int(ec.get("columnIndex", 0))
        key = ec.get("outputKey") or f"col_{idx}"
        sel = f"td:nth-child({idx + 1}), th:nth-child({idx + 1})"
        try:
            cell = row_locator.locator(sel).first
            extracted[key] = (cell.inner_text() or "").strip()
        except Exception:
            extracted[key] = ""
    return id_val, extracted


def main():
    ap = argparse.ArgumentParser(description="Phase 1: run search flow and extract superset from result table")
    ap.add_argument("--config", help="Single JSON file with { flow, siteConfig }")
    ap.add_argument("--flow", help="Flow JSON (use with --site-config)")
    ap.add_argument("--site-config", help="Site config JSON (use with --flow)")
    ap.add_argument("--output", "-o", default="", help="Output JSON path (default: stdout)")
    ap.add_argument("--pattern", default="%", help="Pattern var for {{pattern}} (default: %)")
    ap.add_argument("--headless", action="store_true", help="Run browser headless")
    args = ap.parse_args()

    flow, site_config = load_config(
        config_path=args.config,
        flow_path=args.flow,
        site_config_path=args.site_config,
    )
    steps = flow.get("steps") or []
    rt = site_config.get("resultTable") or {}
    table_selector = rt.get("tableSelector", "")
    row_selector = rt.get("rowSelector", "tbody tr")
    threshold = int(rt.get("threshold", 5))
    row_filter_logic = rt.get("rowFilterLogic", "and")
    row_filter = rt.get("rowFilter") or []
    nested_row_filters = rt.get("nestedRowFilters") or []

    if not table_selector or not steps:
        print("resultTable.tableSelector and flow.steps required", file=sys.stderr)
        sys.exit(1)

    vars_dict = {"pattern": args.pattern}

    def log(msg):
        print(msg, file=sys.stderr)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=args.headless)
        page = browser.new_page()
        try:
            root = run_flow_steps(page, steps, vars_dict, log)
        except Exception as e:
            log(f"Flow failed: {e}")
            browser.close()
            sys.exit(1)

        # Query result table in the same context (page or frame) we ended in
        try:
            table = root.locator(table_selector).first
            table.wait_for(state="visible", timeout=10000)
        except Exception as e:
            log(f"Table not found: {table_selector} - {e}")
            browser.close()
            sys.exit(1)

        rows_loc = table.locator(row_selector)
        n_rows = rows_loc.count
        log(f"Found {n_rows} rows")

        ids = []
        rows_data = []
        for i in range(n_rows):
            row_loc = rows_loc.nth(i)
            if not row_matches_filter(row_loc, row_filter, row_filter_logic, table_selector, row_selector):
                continue
            if not nested_filter_passes(row_loc, nested_row_filters):
                continue
            id_val, extracted = extract_row_id_and_data(row_loc, site_config, rt)
            if id_val:
                ids.append(id_val)
                rows_data.append({"id": id_val, **extracted})

        browser.close()

    if len(ids) < threshold:
        log(f"Row count {len(ids)} below threshold {threshold}; not writing superset")
        out = {
            "siteId": site_config.get("siteId", ""),
            "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "ids": ids,
            "rows": rows_data,
            "belowThreshold": True,
            "threshold": threshold,
        }
    else:
        out = {
            "siteId": site_config.get("siteId", ""),
            "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "searchConfigSnapshot": {"pattern": args.pattern},
            "ids": ids,
            "rows": rows_data,
        }

    out_str = json.dumps(out, indent=2)
    if args.output:
        Path(args.output).write_text(out_str, encoding="utf-8")
        log(f"Wrote {len(ids)} ids to {args.output}")
    else:
        print(out_str)


if __name__ == "__main__":
    main()
