/**
 * POST /api/pipeline/convert-codegen
 * Convert Playwright codegen output to scraper config and save (including codegen_source).
 * In production: requires PIPELINE_CONVERT_URL (deployed Python pipeline) or returns 503.
 */
import { createClient } from "@supabase/supabase-js"

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  /** Optional: deployed Python pipeline base URL (e.g. https://your-pipeline.fly.dev). If unset, returns 503. */
  PIPELINE_CONVERT_URL?: string
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { env } = context
  const pipelineUrl = env.PIPELINE_CONVERT_URL?.replace(/\/$/, "")

  if (!pipelineUrl) {
    return json(
      {
        success: false,
        error:
          "Codegen conversion is not available in production. Run the app locally (npm run dev) with the Python pipeline (cd scraper/pipeline && uvicorn api:app --port 8000), or set PIPELINE_CONVERT_URL to your deployed pipeline URL.",
      },
      503
    )
  }

  let body: { code?: string; county_id?: string; config_type?: string }
  try {
    body = (await context.request.json()) as typeof body
  } catch {
    return json({ success: false, error: "Invalid JSON body" }, 400)
  }

  const { code, county_id, config_type = "superset" } = body
  if (!code || !county_id) {
    return json({ success: false, error: "code and county_id are required" }, 400)
  }

  try {
    const converterRes = await fetch(`${pipelineUrl}/pipeline/convert-codegen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, county_id }),
    })

    if (!converterRes.ok) {
      const errText = await converterRes.text()
      return json({ success: false, error: errText || "Converter service error" }, 502)
    }

    const result = (await converterRes.json()) as {
      config: {
        navigation_steps: unknown
        search_form?: unknown
        results_table?: unknown
        extraction_rules: unknown
      }
      needs_review?: string[]
    }

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    const row = {
      county_id,
      config_type: config_type === "extraction" ? "extraction" : "superset",
      navigation_steps: result.config.navigation_steps,
      search_form: result.config.search_form ?? null,
      results_table: result.config.results_table ?? null,
      extraction_rules: result.config.extraction_rules,
      codegen_source: code,
      is_validated: false,
    }

    const { data: config, error } = await supabase
      .from("scraper_configs")
      .upsert(row, { onConflict: "county_id,config_type" })
      .select()
      .single()

    if (error) return json({ success: false, error: error.message }, 500)

    return json({
      success: true,
      config_id: config.id,
      config: result.config,
      needs_review: result.needs_review,
      message: "Config saved. Codegen stored. Please review and validate.",
    })
  } catch (e) {
    return json(
      { success: false, error: e instanceof Error ? e.message : "Unknown error" },
      500
    )
  }
}
