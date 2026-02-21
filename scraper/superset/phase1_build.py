#!/usr/bin/env python3
"""
Phase 1 superset builder: run one search flow, then filter and extract rows from the result table.

Usage:
  # Single combined file (flow + site config):
  python phase1_build.py --config superset-phase1.json [--output superset.json] [--pattern "A%"] [--headless]

  # Separate files:
  python phase1_build.py --flow flow.json --site-config site-config.json [--output superset.json]

Config file (combined) shape: { "flow": { "name": "...", "steps": [...] }, "siteConfig": { ... } }
Site config must include resultTable (tableSelector, rowSelector, primaryId, threshold, optional rowFilter, nestedRowFilters, nestedTableChecks, extractColumns).

--- Nested tables: include/exclude rows and output exists/values ---

1) Include or exclude PARENT ROWS based on nested content (exists / not exists)
   Use nestedRowFilters. Each entry:
   - selectorWithinRow: CSS selector evaluated INSIDE each result row (e.g. "td:nth-child(5) table#EventGrid tbody tr").
   - condition: "exists" = keep parent if at least one match; "not_exists" = keep parent if zero matches.
   - includeParentWhen: true = keep parent when condition holds; false = drop parent when condition holds.

   Example: only keep result rows that contain a nested table with at least one row:
     "nestedRowFilters": [
       { "selectorWithinRow": "td:nth-child(5) table#EventGrid tbody tr", "condition": "exists", "includeParentWhen": true }
     ]
   Example: exclude result rows that have any nested "ORDER FINAL" row (if you had a selector for that cell):
     "nestedRowFilters": [
       { "selectorWithinRow": "td:nth-child(5) table#EventGrid tbody tr:has(td:has-text('ORDER FINAL'))", "condition": "exists", "includeParentWhen": false }
     ]

2) Output per-row data from nested tables (exists, or value in column)
   Use nestedTableChecks. Each entry:
   - name: label in output (e.g. "HasEventGrid").
   - tableSelector: CSS for the nested table/container (e.g. "table#EventGrid").
   - scope: "row" = look inside the current result row; "page" = look from page/frame root.
   - rowSelector: optional CSS for rows inside the table (e.g. "tbody tr"). Omit to check the table element itself.
   - operator: "exists" = at least one element/row; "equals" = cell text equals value; "in" = cell text in value list.
   - value: for equals/in, the string or list of strings to match in the column.
   - columnIndex: 0-based column (for equals/in only).
   - outputInRow: true = add { name: { "exists": bool, "rowIndex"?: number } } to each row in the output.

   Example: record whether a nested table exists (no column check):
     "nestedTableChecks": [
       { "name": "HasEventGrid", "tableSelector": "table#EventGrid", "scope": "row", "operator": "exists", "outputInRow": true }
     ]
   Example: record whether any row in the nested table has column 0 equal to "ORDER FINAL":
     "nestedTableChecks": [
       { "name": "HasOrderFinal", "tableSelector": "table#EventGrid", "scope": "row", "rowSelector": "tbody tr", "columnIndex": 0, "operator": "equals", "value": "ORDER FINAL", "outputInRow": true }
     ]
   Note: rowSelector must be a CSS selector (e.g. "tbody tr"), not plain text. Use "equals" with value "ORDER FINAL" to match cell text.

--- Troubleshooting "0 matched" ---

If you see "Finished processing N rows; 0 matched", the main-table row filter is excluding every row. Run with --debug-row-filter to log the actual cell values for the filter columns on the first 5 rows, e.g.:
  python phase1_build.py --config superset-phase1.json --output out.json --debug-row-filter
Then compare "col0=... col4=... col8=..." to your expected values. Fix columnIndex (0-based from left) or value (exact string match, trim/case) in resultTable.rowFilter.
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
                from_sel = cfg.get("fromSelector", "")
                to_sel = cfg.get("toSelector", "")
                from_val = str(cfg.get("fromValue", ""))
                to_val = str(cfg.get("toValue", ""))
                if from_sel:
                    elem = root.locator(from_sel).first
                    is_datepicker = elem.evaluate("el => el.classList.contains('hasDatepicker') || el.classList.contains('DatePicker') || !!el.dataset.datepicker")
                    if is_datepicker:
                        elem.evaluate(f"el => {{ el.value = '{from_val}'; if (window.jQuery && window.jQuery.datepicker) {{ window.jQuery(el).datepicker('setDate', '{from_val}'); }} window.jQuery(el).trigger('change'); }}")
                    else:
                        elem.fill(from_val)
                if to_sel:
                    elem = root.locator(to_sel).first
                    is_datepicker = elem.evaluate("el => el.classList.contains('hasDatepicker') || el.classList.contains('DatePicker') || !!el.dataset.datepicker")
                    if is_datepicker:
                        elem.evaluate(f"el => {{ el.value = '{to_val}'; if (window.jQuery && window.jQuery.datepicker) {{ window.jQuery(el).datepicker('setDate', '{to_val}'); }} window.jQuery(el).trigger('change'); }}")
                    else:
                        elem.fill(to_val)

            elif typ == "form_fill":
                fields = cfg.get("fields") or []
                for f in fields:
                    sel = f.get("selector", "")
                    val = str(f.get("value", ""))
                    if sel:
                        elem = root.locator(sel).first
                        # Check if it's a datepicker (has datepicker class or data attribute)
                        is_datepicker = elem.evaluate("el => el.classList.contains('hasDatepicker') || el.classList.contains('DatePicker') || !!el.dataset.datepicker")
                        if is_datepicker:
                            # For jQuery UI datepicker: set value via JS and trigger change
                            elem.evaluate(f"el => {{ el.value = '{val}'; if (window.jQuery && window.jQuery.datepicker) {{ window.jQuery(el).datepicker('setDate', '{val}'); }} window.jQuery(el).trigger('change'); }}")
                        else:
                            elem.fill(val)
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


def get_cell_text_for_column(row_locator, col_idx):
    """Return trimmed text of the cell at 0-based col_idx in the row."""
    cell_sel = f"td:nth-child({col_idx + 1}), th:nth-child({col_idx + 1})"
    try:
        cell = row_locator.locator(cell_sel).first
        return (cell.inner_text() or "").strip()
    except Exception:
        return ""


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
        cell_text = get_cell_text_for_column(row_locator, col_idx)
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
            count = row_locator.locator(sel).count()
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


def run_nested_table_checks(row_locator, root, nested_checks, log):
    """
    Run nestedTableChecks: for each check, resolve scope (row vs page), then either
    - operator 'exists': element/table (and optional rowSelector) has at least one match.
    - operator 'equals' / 'in': at least one row in the table has cell text matching value(s).
    Returns a dict to merge into the row's extracted data (only checks with outputInRow: true).
    """
    if not nested_checks:
        return {}
    log(f"  [nestedTableChecks] Running {len(nested_checks)} check(s)...")
    out = {}
    for nc in nested_checks:
        if not nc.get("outputInRow"):
            continue
        name = (nc.get("name") or "nested").strip() or "nested"
        scope = nc.get("scope", "row")
        base = row_locator if scope == "row" else root
        table_sel = (nc.get("tableSelector") or "").strip()
        if not table_sel:
            out[name] = {"exists": False}
            continue
        row_sel = (nc.get("rowSelector") or "").strip() or None
        operator = nc.get("operator", "exists")
        # rowSelector must be valid CSS (e.g. "tbody tr"). If it looks like plain text (e.g. "ORDER FINAL"), ignore it for "exists"
        if operator == "exists" and row_sel and " " in row_sel and not any(c in row_sel for c in "#.[]:>"):
            row_sel = None
        value = nc.get("value")
        col_idx = max(0, int(nc.get("columnIndex", 0)))
        cell_sel = f"td:nth-child({col_idx + 1}), th:nth-child({col_idx + 1})"
        exists = False
        row_index = None
        try:
            table_loc = base.locator(table_sel)
            table_count = table_loc.count()
            log(f"    [nestedCheck '{name}'] scope={scope}, tableSelector='{table_sel}', found {table_count} table(s)")
            # If scope=row and table not found in current row, try next sibling row (expandable detail pattern)
            if table_count == 0 and scope == "row" and base == row_locator:
                try:
                    next_row = row_locator.locator("xpath=following-sibling::tr[1]")
                    next_count = next_row.count()
                    log(f"    [nestedCheck '{name}'] next sibling row count: {next_count}")
                    if next_count > 0:
                        log(f"    [nestedCheck '{name}'] searching for table in sibling...")
                        # Check if sibling row is hidden (display: none) - common for expandable rows
                        expanded = False
                        try:
                            is_hidden = next_row.first.evaluate("el => window.getComputedStyle(el).display === 'none'")
                            if is_hidden:
                                expand_sel = nc.get("expandSelector", "")
                                if expand_sel:
                                    log(f"    [nestedCheck '{name}'] sibling row is hidden, clicking '{expand_sel}' to expand...")
                                    try:
                                        row_locator.locator(expand_sel).first.click()
                                        # Wait for expansion and content load
                                        import time
                                        time.sleep(1.5)
                                        expanded = True
                                        log(f"    [nestedCheck '{name}'] ✓ expanded row")
                                        # Debug: check if sibling now has content
                                        try:
                                            sibling_html_after = next_row.first.evaluate("el => el.innerHTML")
                                            log(f"    [nestedCheck '{name}'] sibling HTML after expand (first 800 chars): {sibling_html_after[:800]}")
                                        except Exception:
                                            pass
                                    except Exception as click_err:
                                        log(f"    [nestedCheck '{name}'] expand click failed: {click_err}")
                                else:
                                    log(f"    [nestedCheck '{name}'] sibling hidden but no expandSelector configured")
                        except Exception:
                            pass
                        
                        table_in_next = next_row.locator(table_sel)
                        sibling_table_count = table_in_next.count()
                        log(f"    [nestedCheck '{name}'] sibling table count: {sibling_table_count}")
                        
                        # Collapse after checking if configured
                        if expanded and nc.get("collapseAfter", False):
                            try:
                                collapse_sel = nc.get("collapseSelector") or expand_sel
                                if collapse_sel:
                                    row_locator.locator(collapse_sel).first.click()
                                    log(f"    [nestedCheck '{name}'] collapsed row")
                            except Exception:
                                pass
                        if sibling_table_count > 0:
                            table_loc = table_in_next
                            table_count = sibling_table_count
                            log(f"    [nestedCheck '{name}'] ✓ using table from sibling row")
                except Exception as e:
                    log(f"    [nestedCheck '{name}'] sibling check exception: {e}")
            
            if operator == "exists":
                loc = table_loc.locator(row_sel) if row_sel else table_loc
                exists = loc.count() > 0
            else:
                def _norm(s):
                    s = str(s).strip()
                    if len(s) >= 2 and s.startswith('\\"') and s.endswith('\\"'):
                        s = s[2:-2]
                    elif len(s) >= 2 and s[0] == '"' and s[-1] == '"':
                        s = s[1:-1]
                    return s.strip()

                rows_loc = table_loc.locator(row_sel or "tr")
                n = rows_loc.count()
                vals = value if operator == "in" and isinstance(value, list) else [value]
                vals = [_norm(v) for v in vals if v is not None and str(v).strip()]
                for r in range(n):
                    cell = rows_loc.nth(r).locator(cell_sel).first
                    cell_text = (cell.inner_text() or "").strip()
                    cell_text_norm = _norm(cell_text)
                    # DEBUG: log first 3 rows
                    if r < 3:
                        log(f"    [nestedCheck '{name}'] row {r} col {col_idx}: '{cell_text}' (norm: '{cell_text_norm}')")
                    if operator == "equals":
                        if vals and cell_text_norm == _norm(vals[0]):
                            exists = True
                            row_index = r
                            log(f"    [nestedCheck '{name}'] MATCH at row {r}")
                            break
                    else:  # in
                        if cell_text_norm in vals:
                            exists = True
                            row_index = r
                            log(f"    [nestedCheck '{name}'] MATCH at row {r}: '{cell_text_norm}' in {vals}")
                            break
        except Exception:
            exists = False
        out[name] = {"exists": exists}
        if row_index is not None:
            out[name]["rowIndex"] = row_index
    return out


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
    ap.add_argument("--debug-row-filter", action="store_true", help="Log main-table cell values for row filter columns on first few rows to troubleshoot 0 matched")
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
        n_rows = rows_loc.count()
        log(f"Found {n_rows} rows")

        ids = []
        rows_data = []
        row_timeout_ms = 8000  # per-row locator timeout to avoid long hangs
        page.set_default_timeout(row_timeout_ms)
        debug_row_filter = getattr(args, "debug_row_filter", False)
        # Skip non-data rows: if primary ID column is empty, treat as header/detail row
        primary_id = rt.get("primaryId") or {}
        primary_col = int(primary_id.get("columnIndex", 0)) if primary_id.get("source") == "column" else None

        data_row_num = 0  # 1-based count of data rows (matches visible row number, excludes header/detail)
        try:
            for i in range(n_rows):
                row_loc = rows_loc.nth(i)
                if primary_col is not None:
                    id_cell_text = get_cell_text_for_column(row_loc, primary_col)
                    if not (id_cell_text or "").strip():
                        if debug_row_filter and i < 5:
                            log(f"  [debug] row {i+1} skipped (empty primary ID column {primary_col})")
                        log(f"Processing table row {i + 1}/{n_rows} (skipped, no ID) ...")
                        continue
                data_row_num += 1
                log(f"Processing table row {i + 1}/{n_rows} (data row {data_row_num}) ...")
                passes_filter = row_matches_filter(row_loc, row_filter, row_filter_logic, table_selector, row_selector)
                if debug_row_filter and i < 5:
                    # Log all columns 0..maxCol so user can see DOM order and fix columnIndex in config
                    max_debug_col = 16
                    all_vals = []
                    for c in range(max_debug_col):
                        t = get_cell_text_for_column(row_loc, c)
                        if t or c < 12:  # always show first 12, then only non-empty
                            all_vals.append(f"col{c}={repr(t)}")
                    all_str = " | ".join(all_vals)
                    log(f"  [debug] row {i+1} all columns: {all_str}")
                    col_vals = []
                    for f in row_filter:
                        c = int(f.get("columnIndex", 0))
                        t = get_cell_text_for_column(row_loc, c)
                        col_vals.append(f"col{c}={repr(t)}")
                    expected = " | ".join(f"col{f.get('columnIndex',0)}={repr(f.get('value'))}" for f in row_filter)
                    actual_str = " | ".join(col_vals)
                    log(f"  [debug] row {i+1} filter cols: {actual_str} | expected: {expected} | passed={passes_filter}")
                if not passes_filter:
                    continue
                if not nested_filter_passes(row_loc, nested_row_filters):
                    continue
                id_val, extracted = extract_row_id_and_data(row_loc, site_config, rt)
                nested_checks_result = run_nested_table_checks(
                    row_loc, root, rt.get("nestedTableChecks") or [], log
                )
                extracted = {**extracted, **nested_checks_result}
                if id_val:
                    ids.append(id_val)
                    rows_data.append({"id": id_val, **extracted})
                    log(f"  -> id={id_val}")
        finally:
            page.set_default_timeout(30000)  # restore default

        log(f"Finished processing {n_rows} rows; {len(ids)} matched.")
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
        n_ids = len(ids)
        n_rows = len(rows_data)
        log(f"Wrote {n_ids} ids to {args.output}")
        log(f"Output count: {n_ids} primary ids, {n_rows} rows (extracted values)")
        if rows_data:
            last_record = rows_data[-1]
            log(f"Last record: primary_id={last_record.get('id', '')} | {json.dumps({k: v for k, v in last_record.items() if k != 'id'})}")
        log("Output file written. You can end the process (e.g. Ctrl+C) when ready.")
    else:
        print(out_str)


if __name__ == "__main__":
    main()
