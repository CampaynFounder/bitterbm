/**
 * /api/admin/scraper/flows
 * GET: List flows (optional ?q= search)
 * POST: Create or update flow. Body: { id?, name, description?, flow_json }
 * Auth: X-Admin-Secret OR Bearer + admin email in ADMIN_EMAILS
 */
import { createClient } from "@supabase/supabase-js"

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  ADMIN_SECRET?: string
  ADMIN_EMAILS?: string
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

async function authorize(context: { request: Request; env: Env }): Promise<boolean> {
  const { env } = context
  const headerSecret = context.request.headers.get("x-admin-secret")
  if (env.ADMIN_SECRET && headerSecret === env.ADMIN_SECRET) return true

  const authHeader = context.request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) return false

  const adminEmails = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (adminEmails.length === 0) return false

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7))
  return !!(user?.email && adminEmails.includes(user.email.toLowerCase()))
}

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  if (!(await authorize(context))) {
    return json({ error: "Unauthorized" }, 401)
  }

  const { env } = context
  const url = new URL(context.request.url)
  const q = url.searchParams.get("q")?.trim().toLowerCase() || ""

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data, error } = await supabase
    .from("scraper_flows")
    .select("id, name, description, flow_json, created_at, updated_at")
    .order("updated_at", { ascending: false })

  if (error) return json({ error: error.message }, 500)

  let flows = data ?? []
  if (q) {
    flows = flows.filter(
      (f: { name?: string; description?: string }) =>
        (f.name ?? "").toLowerCase().includes(q) ||
        (f.description ?? "").toLowerCase().includes(q)
    )
  }

  return json({ flows })
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  if (!(await authorize(context))) {
    return json({ error: "Unauthorized" }, 401)
  }

  const { env } = context
  let body: { id?: string; name?: string; description?: string; flow_json?: object }
  try {
    body = await context.request.json()
  } catch {
    return json({ error: "Invalid JSON" }, 400)
  }

  const { id, name, description, flow_json } = body
  if (!name?.trim() || !flow_json || typeof flow_json !== "object") {
    return json({ error: "name and flow_json required" }, 400)
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const payload = {
    name: name.trim(),
    description: description?.trim() || null,
    flow_json,
    updated_at: new Date().toISOString(),
  }

  if (id) {
    const { data, error } = await supabase
      .from("scraper_flows")
      .update(payload)
      .eq("id", id)
      .select("id")
      .single()
    if (error) return json({ error: error.message }, 500)
    return json({ id: data.id })
  }

  const { data, error } = await supabase
    .from("scraper_flows")
    .insert(payload)
    .select("id")
    .single()
  if (error) return json({ error: error.message }, 500)
  return json({ id: data.id })
}
