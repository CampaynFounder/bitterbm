/**
 * Run scraper with a visible browser (for login flows).
 *
 * Usage:
 *   npx tsx scripts/run-scraper-headed.ts flow.json
 *   npx tsx scripts/run-scraper-headed.ts flow.json vars.json
 *   cat payload.json | npx tsx scripts/run-scraper-headed.ts
 *
 * Flow JSON shape: { flow: { name, steps }, vars?: {} }
 * Or: { name, steps } for flow-only file
 */
import { chromium } from "playwright"
import { createInterface } from "readline"
import { executeFlow } from "../lib/scraper/executor"
import { createClient } from "@supabase/supabase-js"

const rl = createInterface({ input: process.stdin, output: process.stdout })
const question = (q: string) => new Promise<string>((r) => rl.question(q, r))

async function main() {
  const args = process.argv.slice(2)
  let flow: { name?: string; steps: unknown[] }
  let vars: Record<string, string | number> = {}

  if (args.length >= 1) {
    const fs = await import("fs")
    const path = args[0]
    const data = JSON.parse(fs.readFileSync(path, "utf8"))
    flow = data.flow ?? data
    if (args.length >= 2) {
      const varsData = JSON.parse(fs.readFileSync(args[1], "utf8"))
      vars = varsData.vars ?? varsData
    } else {
      vars = data.vars ?? {}
    }
  } else {
    let input = ""
    process.stdin.setEncoding("utf8")
    for await (const chunk of process.stdin) input += chunk
    const data = JSON.parse(input || "{}")
    flow = data.flow ?? data
    vars = data.vars ?? {}
  }

  if (!flow?.steps?.length) {
    console.error("Usage: npx tsx scripts/run-scraper-headed.ts <flow.json> [vars.json]")
    console.error("   or: cat payload.json | npx tsx scripts/run-scraper-headed.ts")
    process.exit(1)
  }

  const jobId = crypto.randomUUID()
  console.log("Launching visible browser…")

  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1280, height: 900 })

  const storeFn = async (row: Record<string, unknown>) => {
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
        source_site: (flow as { name?: string }).name ?? "scraper",
        state: row.state ?? null,
        county: row.county ?? null,
        attorneys: attorneysArr.length ? attorneysArr : null,
        gal: row.gal ?? null,
        pdf_urls: row.pdf_urls ?? null,
        text_content: row.text_content ?? row.textContent ?? null,
      })
    }
  }

  try {
    const result = await executeFlow(page, {
      flow: flow as Parameters<typeof executeFlow>[1]["flow"],
      vars,
      jobId,
      sourceSite: (flow as { name?: string }).name,
      onStoreRow: storeFn,
      onLog: (msg) => console.log(msg),
      onPause: async (msg) => {
        console.log("\n→", msg ?? "Pause for login")
        console.log("  Log in in the browser, then press Enter here to continue…")
        await question("")
      },
    })
    console.log("\nDone. Rows stored:", result.rowsStored)
    if (result.error) console.error("Error:", result.error)
  } catch (err) {
    console.error(err)
  } finally {
    await question("\nPress Enter to close browser…")
    await browser.close()
    rl.close()
  }
}

main()
