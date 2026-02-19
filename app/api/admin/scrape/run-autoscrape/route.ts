/**
 * POST /api/admin/scrape/run-autoscrape
 * Proxy to Modal autoscrape web endpoint. Auth: X-Admin-Secret OR Bearer + ADMIN_EMAILS
 * Body: { schema, params?, run_id?, async? }
 */
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

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  if (!(await authorize(req, supabase))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const modalUrl = process.env.MODAL_AUTOSCRAPE_URL
  if (!modalUrl?.trim()) {
    return NextResponse.json(
      { error: "MODAL_AUTOSCRAPE_URL is not set. Deploy autoscrape: modal deploy scraper/autoscrape/modal_runner.py" },
      { status: 503 }
    )
  }

  let body: { schema?: unknown; params?: Record<string, unknown>; run_id?: string; async?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const schema = body.schema
  if (!schema || typeof schema !== "object") {
    return NextResponse.json({ error: "schema required" }, { status: 400 })
  }

  const run_id = body.run_id?.trim() || crypto.randomUUID()
  const params = body.params && typeof body.params === "object" ? body.params : {}
  const asyncRun = body.async === true

  try {
    const res = await fetch(modalUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schema,
        params,
        run_id,
        async: asyncRun,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { error: (data as { error?: string }).error ?? "Modal request failed", run_id },
        { status: res.status >= 400 && res.status < 500 ? res.status : 502 }
      )
    }
    return NextResponse.json({ ...data, run_id })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: "Failed to call Modal", detail: message, run_id },
      { status: 502 }
    )
  }
}
