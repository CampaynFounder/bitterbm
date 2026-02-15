/**
 * POST /api/admin/set-subscription
 * Grant or revoke plan for a user by email.
 * Body: { userEmail: string, action: "grant_flat" | "grant_monthly" | "revoke" }
 * Requires X-Admin-Secret header.
 */
import { createClient } from "@supabase/supabase-js"

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  ADMIN_SECRET?: string
  ADMIN_EMAILS?: string
}

export async function onRequestPost(context: {
  request: Request
  env: Env
}): Promise<Response> {
  const { env } = context
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  const adminEmails = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  const headerSecret = context.request.headers.get("x-admin-secret")
  const authHeader = context.request.headers.get("authorization")

  let authorized = false
  if (env.ADMIN_SECRET && headerSecret === env.ADMIN_SECRET) {
    authorized = true
  } else if (authHeader?.startsWith("Bearer ") && adminEmails.length > 0) {
    const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7))
    if (user?.email && adminEmails.includes(user.email.toLowerCase())) {
      authorized = true
    }
  }

  if (!authorized) {
    return json({ error: "Unauthorized" }, 401)
  }

  let body: { userEmail?: string; action?: string }
  try {
    body = await context.request.json()
  } catch {
    return json({ error: "Invalid JSON" }, 400)
  }

  const email = typeof body?.userEmail === "string" ? body.userEmail.trim() : ""
  const action = body?.action as string | undefined
  const validActions = ["grant_flat", "grant_monthly", "revoke"] as const

  if (!email) {
    return json({ error: "userEmail required" }, 400)
  }
  if (!action || !validActions.includes(action as typeof validActions[number])) {
    return json({ error: "action must be grant_flat, grant_monthly, or revoke" }, 400)
  }

  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (listError) {
    return json({ error: listError.message }, 500)
  }

  const target = users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (!target) {
    return json({ error: "User not found" }, 404)
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
    return json({ error: error.message }, 500)
  }

  return json({ success: true, plan, email: target.email })
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
