import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getEffectiveProvider, complete, type LLMProvider } from "@/lib/autoscrape/llm-client"

const SYSTEM_PROMPT = `You are an expert web automation engineer. You will be given a DOM interaction session log (clicks, form fills, tables that appeared). Your task is to output a complete workflow schema as valid JSON only (no markdown).

Output format:
{ "domain": "string", "description": "string", "confidence": 0.0-1.0, "warnings": [], "steps": [ { "id": "string", "type": "form_fill|date_range|checkbox_group|click|navigate|row_crawler", ... } ] }

Step types: form_fill (fields, submit), date_range (from, to), row_crawler (rowSelector, capture: [{field, selector, attr}], expand?: { trigger, subTable }, pagination?). Use row_crawler for table rows; use expand when a click revealed a sub-table. Output ONLY valid JSON.`

async function authorize(
  req: NextRequest,
  supabase: { auth: { getUser: (t: string) => Promise<{ data: { user: { email?: string } | null } }> } }
): Promise<boolean> {
  const secret = process.env.ADMIN_SECRET
  if (secret && req.headers.get("x-admin-secret") === secret) return true
  const auth = req.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) return false
  const emails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
  if (emails.length === 0) return false
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

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  if (!(await authorize(req, supabase))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { session?: object; context?: string; captureRules?: Array<{ field: string; [k: string]: unknown }>; llm_provider?: LLMProvider }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const session = body.session
  if (!session || typeof session !== "object") {
    return NextResponse.json({ error: "session required" }, { status: 400 })
  }

  const env = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  }

  const provider = body.llm_provider ?? "openai"
  const effective = getEffectiveProvider(provider, env)

  const userContent = condenseSession(session as Parameters<typeof condenseSession>[0])
    + (body.context ? `\n\nAdditional context:\n${body.context}` : "")

  try {
    const result = await complete({
      provider,
      system: SYSTEM_PROMPT,
      user: userContent,
      maxTokens: 8000,
      env,
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
              Object.assign(cap, {
                ...(rule.condition != null && { condition: rule.condition }),
                ...(rule.ifFalse != null && { ifFalse: rule.ifFalse }),
                ...(rule.pdfHandling != null && { pdfHandling: rule.pdfHandling }),
                ...(rule.selector != null && { selector: rule.selector }),
                ...(rule.attr != null && { attr: rule.attr }),
                ...(rule.role != null && { role: rule.role }),
              })
              merged = true
              break
            }
          }
          if (merged) break
        }
        if (!merged) warnings.push(`Capture rule for field "${field}" had no matching schema capture`)
      }
    }

    return NextResponse.json({
      schema,
      providerUsed: result.providerUsed,
      fallbackOccurred: result.fallbackOccurred ?? false,
      warnings: warnings.length ? warnings : undefined,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: "Compile failed", detail: message }, { status: 500 })
  }
}
