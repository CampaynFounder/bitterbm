import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { chromium } from "playwright"
import { executeFlow } from "@/lib/scraper/executor"
import type { ScraperFlow } from "@/lib/scraper/types"

const PDF_BUCKET = "scraped-pdfs"
const SCREENSHOT_BUCKET = "scraped-screenshots"

/**
 * POST /api/admin/scrape/run
 * Runs a scraper flow with Playwright.
 * Auth: X-Admin-Secret OR Bearer + admin email in ADMIN_EMAILS
 */
export const maxDuration = 300

async function authorize(
  req: NextRequest,
  supabase: { auth: { getUser: (token: string) => Promise<{ data: { user: { email?: string } | null } }> } }
): Promise<boolean> {
  const adminSecret = process.env.ADMIN_SECRET
  const headerSecret = req.headers.get("x-admin-secret")
  if (adminSecret && headerSecret === adminSecret) return true

  const authHeader = req.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) return false
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
  if (adminEmails.length === 0) return false
  const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7))
  return !!(user?.email && adminEmails.includes(user.email.toLowerCase()))
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  if (!(await authorize(req, supabase))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { flow: ScraperFlow; vars?: Record<string, string | number | string[]>; ids?: string[]; flowId?: string; dryRun?: boolean; stopAtStep?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  const { flow, flowId, dryRun, stopAtStep } = body
  const vars = { ...body.vars, ...(Array.isArray(body.ids) && body.ids.length > 0 ? { ids: body.ids } : {}) }
  if (!flow?.steps?.length) {
    return NextResponse.json(
      { error: "flow.steps required" },
      { status: 400 }
    )
  }

  const jobId = crypto.randomUUID()
  const sourceSite = flow.name
  const logs: string[] = []
  const previewRows: Record<string, unknown>[] = []
  let pdfDocumentsStored = 0

  const onStorePdfDocument = async (data: {
    pdfUrl: string
    row: Record<string, unknown>
    ctx: { jobId: string; flowId?: string; sourceSite?: string }
    screenshotBuffer?: Buffer
    screenshotBuffers?: Buffer[]
  }) => {
    if (dryRun) return
    const attorneysRaw = data.row.attorneys ?? data.row.attorney
    const attorneysArr = Array.isArray(attorneysRaw)
      ? attorneysRaw
      : typeof attorneysRaw === "string"
        ? (attorneysRaw ? attorneysRaw.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean) : [])
        : data.row.attorney ? [String(data.row.attorney)] : []

    const state = (data.row.state ?? null) as string | null
    const county = (data.row.county ?? "") as string | null
    const stateDir = state || "unknown"
    const pdfId = crypto.randomUUID()
    const pdfPath = `${stateDir}/${county || "unknown"}/${pdfId}.pdf`
    let storagePath: string | null = null
    let screenshotPath: string | null = null
    const screenshotPaths: string[] = []

    try {
      const res = await fetch(data.pdfUrl, { headers: { "User-Agent": "Mozilla/5.0" } })
      if (!res.ok) throw new Error(`Fetch PDF failed: ${res.status}`)
      const pdfBytes = await res.arrayBuffer()
      const { error: uploadErr } = await supabase.storage
        .from(PDF_BUCKET)
        .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true })
      if (uploadErr) throw new Error(`Upload PDF failed: ${uploadErr.message}`)
      storagePath = pdfPath

      const buffers = (data.screenshotBuffers?.length ? data.screenshotBuffers : data.screenshotBuffer ? [data.screenshotBuffer] : []) as Buffer[]
      for (let i = 0; i < buffers.length; i++) {
        const shotPath = buffers.length > 1
          ? `${stateDir}/${county || "unknown"}/${pdfId}_page${i}.png`
          : `${stateDir}/${county || "unknown"}/${pdfId}.png`
        const { error: shotErr } = await supabase.storage
          .from(SCREENSHOT_BUCKET)
          .upload(shotPath, buffers[i], { contentType: "image/png", upsert: true })
        if (!shotErr) {
          screenshotPaths.push(shotPath)
          if (screenshotPath == null) screenshotPath = shotPath
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logs.push(`extract_pdf store failed: ${msg}`)
      return
    }

    const { error } = await supabase.from("pdf_documents").insert({
      job_id: jobId,
      flow_id: flowId ?? null,
      source_site: sourceSite,
      source_url: (data.row.source_url as string) ?? null,
      pdf_url: data.pdfUrl,
      pdf_storage_path: storagePath,
      screenshot_path: screenshotPath,
      screenshot_paths: screenshotPaths.length ? screenshotPaths : null,
      state: state ?? null,
      county: county ?? null,
      case_number: (data.row.case_number ?? data.row.caseNumber) as string | null,
      case_name: (data.row.case_name ?? data.row.caseName) as string | null,
      court: (data.row.court as string) ?? null,
      judge: (data.row.judge as string) ?? null,
      attorney: (data.row.attorney as string) ?? null,
      attorneys: attorneysArr.length ? attorneysArr : null,
      gal: (data.row.gal as string) ?? null,
      doc_type: (data.row.doc_type as string) ?? null,
      text_content: (data.row.text_content ?? data.row.textContent) as string | null,
      raw_metadata: data.row,
      scraped_at: new Date().toISOString(),
    })
    if (error) {
      logs.push(`pdf_documents insert failed: ${error.message}`)
      return
    }
    pdfDocumentsStored++
  }

  const onStoreRow = async (row: Record<string, unknown>) => {
    if (dryRun) {
      previewRows.push({ ...row })
      return
    }
    const uniqueCols = flow.deduplication?.uniqueKeyColumns
    if (uniqueCols?.length) {
      const pairs: [string, unknown][] = []
      for (const col of uniqueCols) {
        const val = row[col] ?? row[col.replace(/_/g, "")] ?? null
        if (val != null && val !== "") pairs.push([col, val])
      }
      if (pairs.length > 0) {
        let query = supabase.from("scraped_cases").select("id", { count: "exact", head: true })
        for (const [col, val] of pairs) {
          query = query.eq(col, val)
        }
        const { count } = await query
        if (count && count > 0) {
          logs.push(`store_row: skipped duplicate (${uniqueCols.join(", ")})`)
          return
        }
      }
    }
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
      onStorePdfDocument,
      onLog: (msg) => logs.push(msg),
      stopAtStep: typeof stopAtStep === "number" ? stopAtStep : undefined,
    })

    if (!dryRun) {
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
    }

    return NextResponse.json({
      jobId,
      rowsStored: result.rowsStored,
      pdfDocumentsStored,
      error: result.error ?? null,
      logs,
      ...(dryRun && { dryRun: true, previewRows }),
      ...(result.stoppedAt !== undefined && { stoppedAt: result.stoppedAt, pageUrl: result.pageUrl }),
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
