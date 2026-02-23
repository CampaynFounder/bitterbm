/**
 * PATCH /api/pipeline/scraper-config/results-table
 * Update only the results_table JSON for a county's scraper config (superset type).
 * Body: { county_id: string, config_type?: 'superset' | 'extraction', results_table: object }
 */
import { createClient } from "@supabase/supabase-js"

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

export async function onRequestPatch(context: {
  request: Request
  env: Env
}): Promise<Response> {
  const { env } = context
  try {
    let body: { county_id?: string; config_type?: string; results_table?: unknown }
    try {
      body = (await context.request.json()) as typeof body
    } catch {
      return json({ error: "Invalid JSON body" }, 400)
    }
    const { county_id, config_type = "superset", results_table } = body
    if (!county_id || results_table === undefined) {
      return json({ error: "county_id and results_table are required" }, 400)
    }

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    const { data, error } = await supabase
      .from("scraper_configs")
      .update({
        results_table: typeof results_table === "object" ? results_table : null,
      })
      .eq("county_id", county_id)
      .eq("config_type", config_type === "extraction" ? "extraction" : "superset")
      .select("id, results_table")
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        return json(
          {
            error:
              "No scraper config found for this county and config type. Run Convert & save first.",
          },
          404
        )
      }
      return json({ error: error.message }, 500)
    }

    return json({
      success: true,
      config_id: data.id,
      results_table: data.results_table,
      message: "Result table config saved.",
    })
  } catch (e) {
    console.error("PATCH results-table error:", e)
    return json(
      { error: e instanceof Error ? e.message : "Update failed" },
      500
    )
  }
}
