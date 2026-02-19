/**
 * POST /api/admin/scrape/compile
 * Compile session.json to workflow schema via LLM. Auth: X-Admin-Secret OR Bearer + ADMIN_EMAILS
 */
import { complete, type LLMProvider } from "../../../../lib/autoscrape/llm-client"
import { createClient } from "@supabase/supabase-js"

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  ADMIN_SECRET?: string
  ADMIN_EMAILS?: string
  OPENAI_API_KEY?: string
  ANTHROPIC_API_KEY?: string
  OPENAI_MODEL?: string
  ANTHROPIC_MODEL?: string
}

const SYSTEM_PROMPT = `You are an expert web automation engineer. You will be given a DOM interaction session log (clicks, form fills, tables that appeared). Your task is to output a complete workflow schema as valid JSON only (no markdown).

Output format:
{ "domain": "string", "description": "string", "confidence": 0.0-1.0, "warnings": [], "steps": [ { "id": "string", "type": "form_fill|date_range|checkbox_group|click|navigate|row_crawler", ... } ] }

Step types: form_fill (fields, submit), date_range (from, to), row_crawler (rowSelector, capture: [{field, selector, attr}], expand?: { trigger, subTable }, pagination?). Use row_crawler for table rows; use expand when a click revealed a sub-table. Output ONLY valid JSON.`

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

async function authorize(context: { request: Request; env: Env }): Promise<boolean> {
  const { env } = context
  if (env.ADMIN_SECRET && context.request.headers.get("x-admin-secret") === env.ADMIN_SECRET) return true
  const auth = context.request.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) return false
  const emails = (env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
  if (emails.length === 0) return false
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: { user } } = await supabase.auth.getUser(auth.slice(7))
  return !!(user?.email && emails.includes(user.email.toLowerCase()))
}

function condenseSession(session: { meta?: { url?: string }; snapshots?: Array<{ session?: { events?: unknown[]; initialSnapshot?: { tables?: unknown[] } }; expandPatterns?: unknown[] }> }): string {
  const url = session.meta?.url ?? ""
  let events: unknown[] = []
  let initialTables: unknown[] = []
  let expandPatterns: unknown[] = []
  const snap = session.snapshots?.[0]
  if (snap?.session) {
    events = snap.session.events ?? []
    initialTables = (snap.session.initialSnapshot as { tables?: unknown[] })?.tables ?? []
  }
  if (snap?.expandPatterns) expandPatterns = snap.expandPatterns
  return JSON.stringify({ url, events, initialTables, expandPatterns }, null, 2)
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  if (!(await authorize(context))) return json({ error: "Unauthorized" }, 401)

  const { env } = context
  let body: { session?: object; context?: string; captureRules?: Array<{ field: string; [k: string]: unknown }>; llm_provider?: LLMProvider }
  try {
    body = await context.request.json()
  } catch {
    return json({ error: "Invalid JSON body" }, 400)
  }

  const session = body.session
  if (!session || typeof session !== "object") return json({ error: "session required" }, 400)

  const llmEnv = {
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    OPENAI_MODEL: env.OPENAI_MODEL,
    ANTHROPIC_MODEL: env.ANTHROPIC_MODEL,
  }

  const provider = body.llm_provider ?? "openai"
  const userContent = condenseSession(session as Parameters<typeof condenseSession>[0])
    + (body.context ? `\n\nAdditional context:\n${body.context}` : "")

  try {
    const result = await complete({
      provider,
      system: SYSTEM_PROMPT,
      user: userContent,
      maxTokens: 8000,
      env: llmEnv,
    })

    let raw = result.text.trim()
    raw = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "")
    const schema = JSON.parse(raw) as { steps?: Array<{ capture?: Array<{ field?: string }> }>; warnings?: string[] }

    const captureRules = body.captureRules
    const warnings = schema.warnings ?? []
    if (Array.isArray(captureRules) && schema.steps) {
      for (const rule of captureRules) {
        const field = rule.field
        let merged = false
        for (const step of schema.steps) {
          const capture = step.capture as Array<{ field?: string }> | undefined
          if (!capture) continue
          for (const cap of capture) {
            if (cap.field === field) {
              Object.assign(cap, { condition: rule.condition, ifFalse: rule.ifFalse, pdfHandling: rule.pdfHandling })
              merged = true
              break
            }
          }
          if (merged) break
        }
        if (!merged) warnings.push(`Capture rule for field "${field}" had no matching schema capture`)
      }
    }

    return json({
      schema,
      providerUsed: result.providerUsed,
      fallbackOccurred: result.fallbackOccurred ?? false,
      warnings: warnings.length ? warnings : undefined,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return json({ error: "Compile failed", detail: message }, 500)
  }
}
