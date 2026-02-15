/**
 * POST /api/admin/grant-test-plan
 * Grants the authenticated user flat plan (unlimited access) for testing.
 * Requires X-Admin-Secret header to match ADMIN_SECRET env var.
 */
import { createClient } from "@supabase/supabase-js"

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  ADMIN_SECRET: string
}

export async function onRequestPost(context: {
  request: Request
  env: Env
}): Promise<Response> {
  const { env } = context
  if (!env.ADMIN_SECRET) {
    return json({ error: "Admin secret not configured" }, 500)
  }

  const headerSecret = context.request.headers.get("x-admin-secret")
  if (headerSecret !== env.ADMIN_SECRET) {
    return json({ error: "Unauthorized" }, 401)
  }

  const authHeader = context.request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Authorization required" }, 401)
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7))
  if (authError || !user) {
    return json({ error: "Invalid session" }, 401)
  }

  const { error } = await supabase
    .from("subscriptions")
    .upsert(
      {
        user_id: user.id,
        plan: "flat",
        status: "active",
        stripe_subscription_id: null,
        stripe_price_id: null,
        current_period_end: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )

  if (error) {
    return json({ error: error.message }, 500)
  }

  return json({ success: true, plan: "flat" })
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
