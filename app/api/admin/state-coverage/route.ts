import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

/**
 * GET  - List supported states + state requests (emails) for admin
 * POST - Update supported states. Body: { supportedStates: string[] }
 * Auth: Bearer token (admin email in ADMIN_EMAILS)
 */
function isAdmin(authHeader: string | null, adminEmails: string[]): Promise<boolean> {
  if (!authHeader?.startsWith("Bearer ") || adminEmails.length === 0) return Promise.resolve(false)
  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  return supabaseAuth.auth.getUser(authHeader.slice(7)).then(({ data: { user } }) =>
    Boolean(user?.email && adminEmails.includes(user.email.toLowerCase()))
  )
}

export async function GET(req: NextRequest) {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
  const authHeader = req.headers.get("authorization")
  if (!(await isAdmin(authHeader, adminEmails))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [supportedRes, requestsRes, countsRes] = await Promise.all([
    supabase.rpc("get_supported_states"),
    supabase.from("state_requests").select("state_code, email, created_at").order("created_at", { ascending: false }),
    supabase.rpc("get_state_request_counts"),
  ])

  const supportedStates = (supportedRes.data ?? []) as string[]
  const requests = requestsRes.data ?? []
  const counts = (countsRes.data ?? []) as { state_code: string; request_count: number }[]

  return NextResponse.json({
    supportedStates,
    requests,
    counts: counts.reduce((acc, c) => ({ ...acc, [c.state_code]: Number(c.request_count) }), {} as Record<string, number>),
  })
}

export async function POST(req: NextRequest) {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
  const authHeader = req.headers.get("authorization")
  if (!(await isAdmin(authHeader, adminEmails))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { supportedStates?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const supportedStates = Array.isArray(body?.supportedStates)
    ? body.supportedStates.filter((s): s is string => typeof s === "string" && /^[A-Z]{2}$/.test(s))
    : []

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await supabase
    .from("app_config")
    .upsert({ key: "supported_states", value: supportedStates, updated_at: new Date().toISOString() }, { onConflict: "key" })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, supportedStates })
}
