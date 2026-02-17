import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { chromium } from "playwright"
import { executeFlow } from "@/lib/scraper/executor"
import type { ScraperFlow } from "@/lib/scraper/types"

/**
 * POST /api/admin/scrape/run
 * Runs a scraper flow with Playwright.
 * Requires X-Admin-Secret and flow JSON + optional vars.
 */
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret) {
    return NextResponse.json(
      { error: "Admin secret not configured" },
      { status: 500 }
    )
  }

  const headerSecret = req.headers.get("x-admin-secret")
  if (headerSecret !== adminSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { flow: ScraperFlow; vars?: Record<string, string | number>; flowId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  const { flow, vars = {}, flowId } = body
  if (!flow?.steps?.length) {
    return NextResponse.json(
      { error: "flow.steps required" },
      { status: 400 }
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const jobId = crypto.randomUUID()
  const sourceSite = flow.name
  const logs: string[] = []

  const onStoreRow = async (row: Record<string, unknown>) => {
    const attorneysRaw = row.attorneys ?? row.attorney
    const attorneysArr = Array.isArray(attorneysRaw)
      ? attorneysRaw
      : typeof attorneysRaw === "string"
        ? (attorneysRaw ? attorneysRaw.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean) : [])
        : attorneysRaw ? [String(attorneysRaw)] : []
    const mapped: Record<string, unknown> = {
      flow_id: flowId ?? null,
      source_site: sourceSite,
      source_url: row.source_url ?? null,
      case_number: row.case_number ?? row.caseNumber ?? null,
      case_name: row.case_name ?? row.caseName ?? null,
      court: row.court ?? null,
      judge: row.judge ?? null,
      attorney: row.attorney ?? null,
      state: row.state ?? null,
      county: row.county ?? null,
      attorneys: attorneysArr.length ? attorneysArr : null,
      gal: row.gal ?? null,
      case_type: row.case_type ?? row.caseType ?? null,
      case_status: row.case_status ?? row.caseStatus ?? null,
      date_filed: row.date_filed ?? row.dateFiled ?? null,
      pdf_urls: row.pdf_urls ?? null,
      text_content: row.text_content ?? row.textContent ?? null,
      raw_data: row,
      scraped_at: row.scraped_at ?? new Date().toISOString(),
    }
    const { error } = await supabase.from("scraped_cases").insert(mapped)
    if (error) throw new Error(`Store failed: ${error.message}`)
  }

  let browser
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    })
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    })
    await page.setViewportSize({ width: 1280, height: 720 })

    const result = await executeFlow(page, {
      flow,
      vars,
      jobId,
      flowId,
      sourceSite,
      onStoreRow,
      onLog: (msg) => logs.push(msg),
    })

    await supabase.from("scraper_jobs").insert({
      id: jobId,
      flow_id: flowId ?? null,
      status: result.error ? "failed" : "completed",
      vars,
      rows_scraped: result.rowsStored,
      error_message: result.error ?? null,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    })

    return NextResponse.json({
      jobId,
      rowsStored: result.rowsStored,
      error: result.error ?? null,
      logs,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await supabase.from("scraper_jobs").insert({
      id: jobId,
      flow_id: flowId ?? null,
      status: "failed",
      vars,
      rows_scraped: 0,
      error_message: msg,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    })
    return NextResponse.json(
      { error: msg, jobId, rowsStored: 0, logs },
      { status: 500 }
    )
  } finally {
    if (browser) await browser.close()
  }
}
