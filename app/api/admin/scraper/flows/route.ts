import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

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

/**
 * GET /api/admin/scraper/flows?kind=...&q=...
 * List flows by kind; optional search by name/description
 */
export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  if (!(await authorize(req, supabase))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim().toLowerCase() || ""
  const kind = searchParams.get("kind")?.trim() || ""

  const allowedKinds = ["scraper", "superset_flow", "superset_site_config", "superset_result_config", "superset_e2e", "retrieval_flow", "autoscrape_flow"]
  if (!kind || !allowedKinds.includes(kind)) {
    return NextResponse.json(
      { error: "Query param 'kind' required. Use one of: " + allowedKinds.join(", ") },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from("scraper_flows")
    .select("id, name, description, flow_json, kind, created_at, updated_at")
    .eq("kind", kind)
    .order("updated_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let flows = data ?? []
  if (q) {
    flows = flows.filter(
      (f) =>
        (f.name ?? "").toLowerCase().includes(q) ||
        (f.description ?? "").toLowerCase().includes(q)
    )
  }

  return NextResponse.json({ flows })
}

/**
 * POST /api/admin/scraper/flows
 * Create or update flow. Body: { id?, name, description?, flow_json, kind? }
 */
export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  if (!(await authorize(req, supabase))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { id?: string; name?: string; description?: string; flow_json?: object; kind?: string; action?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (body.action === "delete" && body.id?.trim()) {
    const { error } = await supabase.from("scraper_flows").delete().eq("id", body.id.trim())
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  let { id, name, description, flow_json, kind } = body
  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 })
  }
  if (flow_json == null) {
    return NextResponse.json({ error: "flow_json is required" }, { status: 400 })
  }
  if (typeof flow_json === "string") {
    try {
      flow_json = JSON.parse(flow_json) as object
    } catch {
      return NextResponse.json({ error: "flow_json must be valid JSON when sent as string" }, { status: 400 })
    }
  }
  if (typeof flow_json !== "object" || Array.isArray(flow_json)) {
    return NextResponse.json({ error: "flow_json must be an object" }, { status: 400 })
  }

  const flowKind = (kind && ["scraper", "superset_flow", "superset_site_config", "superset_result_config", "superset_e2e", "retrieval_flow", "autoscrape_flow"].includes(kind))
    ? kind
    : "scraper"

  const payload = {
    name: name.trim(),
    description: description?.trim() || null,
    flow_json,
    kind: flowKind,
    updated_at: new Date().toISOString(),
  }

  if (id) {
    const { data, error } = await supabase
      .from("scraper_flows")
      .update(payload)
      .eq("id", id)
      .select("id")
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ id: data.id })
  }

  const { data, error } = await supabase
    .from("scraper_flows")
    .insert(payload)
    .select("id")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id })
}

/**
 * DELETE /api/admin/scraper/flows
 * Body: { id: string } or query ?id=...
 */
export async function DELETE(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  if (!(await authorize(req, supabase))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let id: string | null = new URL(req.url).searchParams.get("id")
  if (!id) {
    try {
      const body = await req.json().catch(() => ({}))
      id = (body as { id?: string }).id ?? null
    } catch {
      // no body
    }
  }
  if (!id?.trim()) {
    return NextResponse.json({ error: "id required" }, { status: 400 })
  }

  const { error } = await supabase.from("scraper_flows").delete().eq("id", id.trim())
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
