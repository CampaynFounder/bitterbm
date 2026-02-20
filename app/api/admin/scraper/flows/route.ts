import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

/**
 * GET /api/admin/scraper/flows?q=...
 * List flows, optional search by name/description
 */
export async function GET(req: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret) {
    return NextResponse.json({ error: "Admin secret not configured" }, { status: 500 })
  }
  const headerSecret = req.headers.get("x-admin-secret")
  if (headerSecret !== adminSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim().toLowerCase() || ""
  const kind = searchParams.get("kind")?.trim() || ""

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let query = supabase
    .from("scraper_flows")
    .select("id, name, description, flow_json, kind, created_at, updated_at")
    .order("updated_at", { ascending: false })
  if (kind) query = query.eq("kind", kind)
  const { data, error } = await query

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
 * Create or update flow. Body: { id?, name, description?, flow_json }
 */
export async function POST(req: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret) {
    return NextResponse.json({ error: "Admin secret not configured" }, { status: 500 })
  }
  const headerSecret = req.headers.get("x-admin-secret")
  if (headerSecret !== adminSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { id?: string; name: string; description?: string; flow_json: object; kind?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { id, name, description, flow_json, kind } = body
  if (!name?.trim() || !flow_json || typeof flow_json !== "object") {
    return NextResponse.json({ error: "name and flow_json required" }, { status: 400 })
  }

  const flowKind = (kind && ["scraper", "superset_flow", "superset_site_config", "retrieval_flow", "autoscrape_flow"].includes(kind))
    ? kind
    : "scraper"

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

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
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret) {
    return NextResponse.json({ error: "Admin secret not configured" }, { status: 500 })
  }
  const headerSecret = req.headers.get("x-admin-secret")
  if (headerSecret !== adminSecret) {
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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { error } = await supabase.from("scraper_flows").delete().eq("id", id.trim())
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
