import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

/**
 * POST /api/admin/set-subscription
 * Grant or revoke plan for a user by email.
 * Body: { userEmail: string, action: "grant_flat" | "grant_monthly" | "revoke" }
 * Auth: X-Admin-Secret header OR Authorization Bearer (admin email in ADMIN_EMAILS)
 */
export async function POST(req: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  const headerSecret = req.headers.get("x-admin-secret")
  const authHeader = req.headers.get("authorization")

  let authorized = false
  if (adminSecret && headerSecret === adminSecret) {
    authorized = true
  } else if (authHeader?.startsWith("Bearer ") && adminEmails.length > 0) {
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: { user } } = await supabaseAuth.auth.getUser(authHeader.slice(7))
    if (user?.email && adminEmails.includes(user.email.toLowerCase())) {
      authorized = true
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let body: { userEmail?: string; action?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const email = typeof body?.userEmail === "string" ? body.userEmail.trim() : ""
  const action = body?.action as string | undefined
  const validActions = ["grant_flat", "grant_monthly", "revoke"] as const

  if (!email) {
    return NextResponse.json({ error: "userEmail required" }, { status: 400 })
  }
  if (!action || !validActions.includes(action as typeof validActions[number])) {
    return NextResponse.json({ error: "action must be grant_flat, grant_monthly, or revoke" }, { status: 400 })
  }

  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 })
  }

  const target = users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const plan = action === "revoke" ? "free" : action === "grant_flat" ? "flat" : "monthly"
  const status = action === "revoke" ? "canceled" : "active"

  const { error } = await supabase
    .from("subscriptions")
    .upsert(
      {
        user_id: target.id,
        plan,
        status,
        stripe_subscription_id: action === "revoke" ? null : undefined,
        stripe_price_id: action === "revoke" ? null : undefined,
        current_period_end: action === "revoke" ? null : undefined,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, plan, email: target.email })
}
