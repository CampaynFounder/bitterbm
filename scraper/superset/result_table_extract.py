"""
Async result-table extraction for superset creation.

Shared logic used by the pipeline when result_table config is "rich"
(primaryId, rowFilter, nestedRowFilters, extractColumns). Mirrors
phase1_build.py row handling but uses async Playwright.

Usage:
  from scraper.superset.result_table_extract import (
    is_rich_result_config,
    extract_from_result_table_async,
  )
  if is_rich_result_config(table_config):
    ids, rows_data = await extract_from_result_table_async(
      page, root, table_config, vars_dict, log
    )
"""

from typing import Dict, List, Tuple, Any, Optional, Callable

# Type for "root" - Page or Frame from async Playwright (both have locator())
# Avoid importing playwright at module level so callers can use async_api
Root = Any


def is_rich_result_config(rt: Optional[Dict]) -> bool:
    """True if config uses rich schema (primaryId, tableSelector, etc.)."""
    if not rt or not isinstance(rt, dict):
        return False
    # Legacy: row_selector + case_id_selector
    if rt.get("case_id_selector") and rt.get("row_selector"):
        return False
    # Rich: primaryId (and usually tableSelector, rowSelector)
    return bool(rt.get("primaryId") or (rt.get("tableSelector") and rt.get("rowSelector")))


def _norm_val(s: Any) -> str:
    if s is None:
        return ""
    s = str(s).strip()
    if len(s) >= 2 and s.startswith('\\"') and s.endswith('\\"'):
        s = s[2:-2]
    elif len(s) >= 2 and s[0] == '"' and s[-1] == '"':
        s = s[1:-1]
    return s.strip()


async def _get_cell_text_async(locator, primary_id_config: Dict) -> str:
    """Get text or link attribute from a cell (async)."""
    source = primary_id_config.get("source", "column")
    if source == "link":
        link_sel = primary_id_config.get("linkSelector", "a")
        attr = primary_id_config.get("linkAttribute", "href")
        try:
            link = locator.locator(link_sel).first
            out = await link.get_attribute(attr)
            return (out or "").strip()
        except Exception:
            return ""
    try:
        text = await locator.inner_text()
        return (text or "").strip()
    except Exception:
        return ""


async def _get_cell_text_for_column_async(row_locator, col_idx: int) -> str:
    """Return trimmed text of the cell at 0-based col_idx in the row (async)."""
    cell_sel = f"td:nth-child({col_idx + 1}), th:nth-child({col_idx + 1})"
    try:
        cell = row_locator.locator(cell_sel).first
        text = await cell.inner_text()
        return (text or "").strip()
    except Exception:
        return ""


async def _row_matches_filter_async(
    row_locator,
    row_filter_list: List[Dict],
    logic: str,
    log: Optional[Callable[[str], None]] = None,
) -> bool:
    """Evaluate rowFilter conditions (AND/OR + NOT) on a row (async)."""
    if not row_filter_list:
        return True
    results = []
    for f in row_filter_list:
        col_idx = int(f.get("columnIndex", 0))
        op = f.get("operator", "equals")
        val = f.get("value")
        not_flag = f.get("not", False)
        cell_text = await _get_cell_text_for_column_async(row_locator, col_idx)
        if op == "equals":
            match = cell_text == (val if isinstance(val, str) else str(val))
        else:
            vals = val if isinstance(val, list) else [val]
            match = cell_text in [str(v) for v in vals]
        if not_flag:
            match = not match
        results.append(match)
    if logic == "or":
        return any(results)
    return all(results)


async def _nested_filter_passes_async(
    row_locator, nested_filters: List[Dict]
) -> bool:
    """Check nestedRowFilters: selector within row exists/not_exists, includeParentWhen (async)."""
    for nf in nested_filters or []:
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


async def _extract_row_id_and_data_async(row_locator, rt: Dict) -> Tuple[str, Dict]:
    """Extract primary id and extractColumns from a row (async). Returns (id_str, extracted_dict)."""
    primary_id = rt.get("primaryId") or {}
    col_idx = int(primary_id.get("columnIndex", 0))
    cell_sel = f"td:nth-child({col_idx + 1}), th:nth-child({col_idx + 1})"
    id_val = ""
    try:
        cell = row_locator.locator(cell_sel).first
        id_val = await _get_cell_text_async(cell, primary_id)
    except Exception:
        pass
    extracted = {}
    for ec in rt.get("extractColumns") or []:
        idx = int(ec.get("columnIndex", 0))
        key = ec.get("outputKey") or f"col_{idx}"
        sel = f"td:nth-child({idx + 1}), th:nth-child({idx + 1})"
        try:
            cell = row_locator.locator(sel).first
            text = await cell.inner_text()
            extracted[key] = (text or "").strip()
        except Exception:
            extracted[key] = ""
    return id_val, extracted


async def extract_from_result_table_async(
    page,
    root: Root,
    result_table_config: Dict,
    vars_dict: Optional[Dict[str, str]] = None,
    log: Optional[Callable[[str], None]] = None,
) -> Tuple[List[str], List[Dict[str, Any]]]:
    """
    Run result-table extraction on the current page/frame: filter rows and extract IDs + columns.

    Args:
        page: Playwright async Page (for timeouts if needed).
        root: Page or Frame to run locators in (where the result table is).
        result_table_config: Rich resultTable (tableSelector, rowSelector, primaryId, rowFilter, etc.).
        vars_dict: Optional interpolation vars (e.g. {"pattern": "A%"}); not used for extraction, kept for API parity.
        log: Optional log function.

    Returns:
        (ids: List[str], rows_data: List[dict]) where each row in rows_data has "id" plus extractColumns/keys.
    """
    rt = result_table_config
    table_selector = rt.get("tableSelector", "").strip() or "table"
    row_selector = rt.get("rowSelector", "tbody tr").strip() or "tbody tr"
    row_filter_logic = rt.get("rowFilterLogic", "and")
    row_filter = rt.get("rowFilter") or []
    nested_row_filters = rt.get("nestedRowFilters") or []
    # Nested table checks (simplified: we skip expand/collapse for pipeline; can add later)
    nested_table_checks = rt.get("nestedTableChecks") or []

    def _log(msg: str) -> None:
        if log:
            log(msg)

    table = root.locator(table_selector).first
    await table.wait_for(state="visible", timeout=15000)
    rows_loc = table.locator(row_selector)
    n_rows = rows_loc.count()
    _log(f"Found {n_rows} rows")

    ids: List[str] = []
    rows_data: List[Dict[str, Any]] = []
    primary_id = rt.get("primaryId") or {}
    primary_col = (
        int(primary_id.get("columnIndex", 0))
        if primary_id.get("source") == "column"
        else None
    )

    for i in range(n_rows):
        row_loc = rows_loc.nth(i)
        if primary_col is not None:
            id_cell_text = await _get_cell_text_for_column_async(row_loc, primary_col)
            if not (id_cell_text or "").strip():
                continue
        if not await _row_matches_filter_async(
            row_loc, row_filter, row_filter_logic, _log
        ):
            continue
        if not await _nested_filter_passes_async(row_loc, nested_row_filters):
            continue
        id_val, extracted = await _extract_row_id_and_data_async(row_loc, rt)
        # Optional: run nested table checks (exists only for now; no expand)
        for nc in nested_table_checks:
            if not nc.get("outputInRow"):
                continue
            name = (nc.get("name") or "nested").strip() or "nested"
            scope = nc.get("scope", "row")
            base = row_loc if scope == "row" else root
            table_sel = (nc.get("tableSelector") or "").strip()
            if not table_sel:
                extracted[name] = {"exists": False}
                continue
            try:
                loc = base.locator(table_sel)
                if nc.get("rowSelector"):
                    loc = loc.locator(nc.get("rowSelector") or "tr")
                count = loc.count()
                extracted[name] = {"exists": count > 0}
            except Exception:
                extracted[name] = {"exists": False}
        if id_val:
            ids.append(id_val)
            rows_data.append({"id": id_val, **extracted})

    return ids, rows_data
