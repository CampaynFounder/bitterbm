/**
 * Run scraper with a visible browser (for login flows).
 *
 * Usage:
 *   npx tsx scripts/run-scraper-headed.ts flow.json
 *   npx tsx scripts/run-scraper-headed.ts flow.json vars.json
 *   npx tsx scripts/run-scraper-headed.ts flow1.json flow2.json flow3.json   # chain: run in same browser, each starts where the last left off
 *   cat payload.json | npx tsx scripts/run-scraper-headed.ts
 *
 * Flow JSON shape: { flow: { name, steps }, vars?: {} }
 * Or: { name, steps } for flow-only file
 *
 * Chaining: pass multiple flow files; they run in order in the same browser (same tab).
 * Vars from later files merge into the run (later overrides). Files that have only "vars" (no steps) are used as vars only.
 *
 * Paths are tried relative to cwd, then relative to project root (package.json dir).
 */
import { chromium } from "playwright"
import { createInterface } from "readline"
import { existsSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { executeFlow } from "../lib/scraper/executor"
import { createClient } from "@supabase/supabase-js"

const PDF_BUCKET = "scraped-pdfs"
const SCREENSHOT_BUCKET = "scraped-screenshots"

const rl = createInterface({ input: process.stdin, output: process.stdout })
const question = (q: string) => new Promise<string>((r) => rl.question(q, r))

/** Resolve path: try cwd, then project root; fallback session path for scraper/session.json. */
function resolveFlowPath(given: string): string {
  const fromCwd = resolve(process.cwd(), given)
  if (existsSync(fromCwd)) return fromCwd
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const projectRoot = resolve(scriptDir, "..")
  const fromRoot = resolve(projectRoot, given)
  if (existsSync(fromRoot)) return fromRoot
  if (given === "scraper/session.json" || given.endsWith("/scraper/session.json")) {
    const autoscrapeSession = resolve(projectRoot, "scraper/autoscrape/session.json")
    if (existsSync(autoscrapeSession)) return autoscrapeSession
  }
  return fromCwd
}

async function main() {
  const args = process.argv.slice(2)
  const flows: { name?: string; steps: unknown[] }[] = []
  let vars: Record<string, string | number | string[]> = {}

  const idsFileIdx = args.indexOf("--ids-file")
  if (idsFileIdx !== -1 && args[idsFileIdx + 1]) {
    const fs = await import("fs")
    const idsPath = resolveFlowPath(args[idsFileIdx + 1])
    const idsData = JSON.parse(fs.readFileSync(idsPath, "utf8"))
    const ids = Array.isArray(idsData) ? idsData : (idsData.ids ?? [])
    vars.ids = ids
    args.splice(idsFileIdx, 2)
  }

  if (args.length >= 1) {
    const fs = await import("fs")
    for (let i = 0; i < args.length; i++) {
      const path = resolveFlowPath(args[i])
      const data = JSON.parse(fs.readFileSync(path, "utf8"))
      const flow = data.flow ?? data
      if (flow?.steps?.length) {
        flows.push(flow)
      } else if (data.meta != null && Array.isArray(data.snapshots)) {
        console.error("This file looks like an autoscrape session (meta + snapshots), not a flow.")
        console.error("Use the autoscrape pipeline: compile the session, then run the generated flow.")
        process.exit(1)
      }
      if (data.vars && typeof data.vars === "object") {
        vars = { ...vars, ...data.vars }
      }
      if (vars.ids == null && Array.isArray(data.ids)) vars.ids = data.ids
    }
  } else {
    let input = ""
    process.stdin.setEncoding("utf8")
    for await (const chunk of process.stdin) input += chunk
    const data = JSON.parse(input || "{}")
    const flow = data.flow ?? data
    if (flow?.steps?.length) flows.push(flow)
    vars = data.vars ?? {}
  }

  if (flows.length === 0) {
    console.error("Usage: npx tsx scripts/run-scraper-headed.ts <flow.json> [flow2.json ...] [vars.json]")
    console.error("       npx tsx scripts/run-scraper-headed.ts flow.json --ids-file superset.json")
    console.error("   or: cat payload.json | npx tsx scripts/run-scraper-headed.ts")
    process.exit(1)
  }

  const jobId = crypto.randomUUID()
  console.log("Launching visible browser…")

  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1280, height: 900 })

  let totalRowsStored = 0
  const storeFn = async (row: Record<string, unknown>, flowName?: string) => {
    console.log("  Row:", Object.keys(row).join(", "))
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (key && url) {
      const supabase = createClient(url, key)
      const attorneysRaw = row.attorneys ?? row.attorney
      const attorneysArr = Array.isArray(attorneysRaw)
        ? attorneysRaw
        : typeof attorneysRaw === "string"
          ? (attorneysRaw ? (attorneysRaw as string).split(/[,;]/).map((s) => s.trim()).filter(Boolean) : [])
          : attorneysRaw ? [String(attorneysRaw)] : []
      await supabase.from("scraped_cases").insert({
        ...row,
        flow_id: null,
        source_site: flowName ?? "scraper",
        state: row.state ?? null,
        county: row.county ?? null,
        attorneys: attorneysArr.length ? attorneysArr : null,
        gal: row.gal ?? null,
        pdf_urls: row.pdf_urls ?? null,
        text_content: row.text_content ?? row.textContent ?? null,
      })
    }
    totalRowsStored++
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null

  const onStorePdfDocument = async (data: {
    pdfUrl: string
    row: Record<string, unknown>
    ctx: { jobId: string; flowId?: string; sourceSite?: string }
    screenshotBuffer?: Buffer
    screenshotBuffers?: Buffer[]
  }) => {
    if (!supabase) {
      console.log("  PDF (no Supabase):", data.pdfUrl)
      return
    }
    const state = (data.row.state ?? null) as string | null
    const county = (data.row.county ?? "") as string | null
    const stateDir = state || "unknown"
    const pdfId = crypto.randomUUID()
    const pdfPath = `${stateDir}/${county || "unknown"}/${pdfId}.pdf`
    let storagePath: string | null = null
    let screenshotPath: string | null = null
    const screenshotPaths: string[] = []
    const attorneysRaw = data.row.attorneys ?? data.row.attorney
    const attorneysArr = Array.isArray(attorneysRaw)
      ? attorneysRaw
      : typeof attorneysRaw === "string"
        ? (attorneysRaw ? (attorneysRaw as string).split(/[,;]/).map((s) => s.trim()).filter(Boolean) : [])
        : data.row.attorney ? [String(data.row.attorney)] : []

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
      const { error } = await supabase.from("pdf_documents").insert({
        job_id: data.ctx.jobId,
        flow_id: data.ctx.flowId ?? null,
        source_site: data.ctx.sourceSite ?? "scraper",
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
      if (error) throw new Error(error.message)
      console.log("  PDF stored:", data.pdfUrl, screenshotPaths.length ? `(${screenshotPaths.length} screenshots)` : "")
    } catch (err) {
      console.error("  PDF store failed:", err instanceof Error ? err.message : err)
    }
  }

  try {
    for (let i = 0; i < flows.length; i++) {
      const flow = flows[i]
      const label = flows.length > 1 ? ` [${i + 1}/${flows.length}] ${(flow as { name?: string }).name ?? "flow"}` : ""
      console.log(`\n——— Running flow${label} ———`)
      const result = await executeFlow(page, {
        flow: flow as Parameters<typeof executeFlow>[1]["flow"],
        vars,
        jobId,
        sourceSite: (flow as { name?: string }).name,
        onStoreRow: (row, ctx) => storeFn(row, (flow as { name?: string }).name),
        onStorePdfDocument,
        onLog: (msg) => console.log(msg),
        onPause: async (msg) => {
          console.log("\n→", msg ?? "Pause for login")
          console.log("  Log in in the browser, then press Enter here to continue…")
          await question("")
        },
      })
      if (result.error) {
        console.error("Error:", result.error)
        break
      }
      console.log(`Flow${label} done. Rows stored this flow: ${result.rowsStored ?? 0}`)
    }
    console.log("\nDone. Total rows stored:", totalRowsStored)
  } catch (err) {
    console.error(err)
  } finally {
    await question("\nPress Enter to close browser…")
    await browser.close()
    rl.close()
  }
}

main()
