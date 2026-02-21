import { NextRequest, NextResponse } from "next/server"
import { exec } from "child_process"
import { promisify } from "util"
import { readFile, unlink } from "fs/promises"
import { existsSync } from "fs"
import path from "path"

const execAsync = promisify(exec)

/**
 * POST /api/admin/scraper/analyze
 * Body: { url, description, state?, county?, authPause? }
 * Calls Python visual_scraper_builder.py and returns config + screenshot
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { url, description, state, county, authPause } = body

    if (!url?.trim()) {
      return NextResponse.json({ error: "url is required" }, { status: 400 })
    }
    if (!description?.trim()) {
      return NextResponse.json({ error: "description is required" }, { status: 400 })
    }

    // Build command
    const scriptPath = path.join(process.cwd(), "scraper/builder/visual_scraper_builder.py")
    const outputPath = path.join(process.cwd(), "scraper/builder/generated_scraper.json")
    const screenshotPath = path.join(process.cwd(), "scraper/builder/page_screenshot.png")

    const args = [
      "python3",
      scriptPath,
      `--url="${url}"`,
      `--describe="${description}"`,
      `--output="${outputPath}"`,
    ]

    if (state?.trim()) args.push(`--state="${state.trim()}"`)
    if (county?.trim()) args.push(`--county="${county.trim()}"`)
    if (authPause && authPause > 0) args.push(`--auth-pause=${authPause}`)

    const cmd = args.join(" ")

    // Execute Python script
    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 120000, // 2 minutes
      cwd: process.cwd(),
    })

    console.log("Script output:", stdout)
    if (stderr) console.warn("Script stderr:", stderr)

    // Read generated config
    if (!existsSync(outputPath)) {
      return NextResponse.json(
        { error: "Script did not generate config file" },
        { status: 500 }
      )
    }

    const configText = await readFile(outputPath, "utf-8")
    let config: any
    try {
      config = JSON.parse(configText)
    } catch {
      return NextResponse.json(
        { error: "Generated config is not valid JSON", raw: configText },
        { status: 500 }
      )
    }

    // Read screenshot (base64)
    let screenshot: string | undefined
    if (existsSync(screenshotPath)) {
      const screenshotBuffer = await readFile(screenshotPath)
      screenshot = `data:image/png;base64,${screenshotBuffer.toString("base64")}`
      
      // Clean up screenshot after encoding
      await unlink(screenshotPath).catch(() => {})
    }

    // Extract elements from stdout (if logged)
    const elements: any[] = []
    // Parse structure from config if available
    if (config.pageStructure) {
      elements.push(...config.pageStructure)
      delete config.pageStructure
    }

    // Clean up generated file
    await unlink(outputPath).catch(() => {})

    return NextResponse.json({
      config,
      screenshot,
      elements,
    })
  } catch (error: any) {
    console.error("Analysis error:", error)
    return NextResponse.json(
      { error: error.message || "Analysis failed" },
      { status: 500 }
    )
  }
}
