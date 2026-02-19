"""
Autoscrape Modal runner — deploy workflow executor to Modal.

Deploy (from repo root):
    modal deploy scraper/autoscrape/modal_runner.py

No secrets required at deploy (so it always succeeds). After deploy, attach your
existing Modal secret to this app in the dashboard so runs get SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY, and optionally ANTHROPIC_API_KEY.

REST endpoint: POST with { "schema", "params", "run_id" }. run_id from caller (Worker/UI).
"""

import modal
import json
import os
import sys
from pathlib import Path

# Allow importing executor from same directory when deployed
_autoscrape_dir = Path(__file__).resolve().parent
if str(_autoscrape_dir) not in sys.path:
    sys.path.insert(0, str(_autoscrape_dir))

# ─── Modal App Setup ────────────────────────────────────────────────────────

# No secrets required at deploy time (so deploy always succeeds). After deploy, attach
# your existing Modal secret to this app in the dashboard so runtime has SUPABASE_URL,
# SUPABASE_SERVICE_ROLE_KEY, and optionally ANTHROPIC_API_KEY.
app = modal.App("web-automation")

# Image with Playwright + all browsers
playwright_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "playwright",
        "anthropic",
        "asyncpg",       # If using Postgres
        "fastapi",       # Required for @modal.web_endpoint
    )
    .run_commands(
        "playwright install chromium",
        "playwright install-deps chromium",
    )
)


# ─── Core Worker Function ────────────────────────────────────────────────────

@app.function(
    image=playwright_image,
    timeout=3600,           # 1 hour max per run
    memory=2048,            # 2GB RAM for browser + screenshots
    cpu=2,
)
async def run_workflow(
    schema: dict,
    params: dict = None,
    run_id: str = None,
    headless: bool = True,
) -> dict:
    """Execute a workflow schema on Modal. run_id must come from caller (Worker/UI)."""
    from executor import WorkflowExecutor

    params = params or {}
    if run_id:
        params["run_id"] = run_id

    executor = WorkflowExecutor(schema, params)
    await executor.run(headless=headless)

    out = dict(executor.stats)
    if run_id:
        out["run_id"] = run_id
    return out


# ─── Parallelized Date Range Runner ─────────────────────────────────────────

@app.function(
    image=playwright_image,
    timeout=7200,
)
async def run_parallel_date_ranges(
    schema: dict,
    date_ranges: list[dict],
    max_parallel: int = 5,
) -> list[dict]:
    """
    Run the same schema across multiple date ranges in parallel.

    date_ranges example:
    [
      {"startDate": "2024-01-01", "endDate": "2024-03-31"},
      {"startDate": "2024-04-01", "endDate": "2024-06-30"},
      ...
    ]
    """
    import asyncio

    sem = asyncio.Semaphore(max_parallel)

    async def run_one(params):
        async with sem:
            return await run_workflow.remote.aio(schema, params)

    tasks  = [run_one(p) for p in date_ranges]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    return [
        {"params": p, "result": r if not isinstance(r, Exception) else {"error": str(r)}}
        for p, r in zip(date_ranges, results)
    ]


# ─── REST Endpoint ──────────────────────────────────────────────────────────

@app.function(
    image=playwright_image,
)
@modal.web_endpoint(method="POST")
async def trigger_workflow(request: dict) -> dict:
    """
    REST endpoint to trigger a workflow run.
    POST body: { "schema", "params"?, "run_id"?, "async": false }
    run_id must be provided by caller (Worker/UI) for tracking; never generated here.
    """
    schema = request.get("schema")
    params = request.get("params") or {}
    run_id = request.get("run_id")
    async_run = request.get("async", False)

    if not schema:
        return {"error": "schema required"}, 400

    if async_run:
        run_workflow.spawn(schema, params, run_id)
        return {"status": "queued", "run_id": run_id}
    else:
        stats = await run_workflow.remote.aio(schema, params, run_id)
        return {"status": "complete", "stats": stats, "run_id": run_id}


# ─── Scheduled Run Example ──────────────────────────────────────────────────

# Uncomment to run every weekday at 6am UTC:
# @app.function(
#     image=playwright_image,
#     schedule=modal.Cron("0 6 * * 1-5"),
#     secrets=[...],
# )
# async def scheduled_daily_run():
#     schema = json.loads(Path("schema.json").read_text())
#     from datetime import date, timedelta
#     today     = date.today()
#     yesterday = today - timedelta(days=1)
#     params    = {
#         "startDate": str(yesterday),
#         "endDate":   str(today),
#     }
#     await run_workflow.remote.aio(schema, params)


# ─── Local Test Entry ────────────────────────────────────────────────────────

@app.local_entrypoint()
def main(schema_path: str = "schema.json", params_path: str = ""):
    schema = json.loads(Path(schema_path).read_text())
    params = json.loads(Path(params_path).read_text()) if params_path else {}

    print("Running on Modal...")
    stats = run_workflow.remote(schema, params, None)
    print(f"Done: {stats}")
