/**
 * POST /api/create-setup-intent - Create Stripe SetupIntent for $0 PM validation
 * Requires Authorization: Bearer <token>
 */
import { createClient } from "@supabase/supabase-js"
import Stripe from "stripe"

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  STRIPE_SECRET_KEY: string
}

export async function onRequestPost(context: {
  request: Request
  env: Env
}): Promise<Response> {
  const { env } = context
  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: "Stripe not configured" }, 500)
  }

  const authHeader = context.request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401)
  }

  const token = authHeader.slice(7)
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401)
  }

  try {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY)
    const body = await context.request.json().catch(() => ({})) as { plan?: "monthly" | "flat" }
    const plan = body?.plan ?? null

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle()

    let customerId = sub?.stripe_customer_id as string | null

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id
      await supabase.from("subscriptions").upsert(
        {
          user_id: user.id,
          plan: "free",
          status: "active",
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: {
        supabase_user_id: user.id,
        plan: plan ?? "validation_only",
      },
    })

    return json({
      clientSecret: setupIntent.client_secret,
      customerId,
    })
  } catch (err: unknown) {
    console.error("create-setup-intent:", err)
    const msg = err instanceof Error ? err.message : "Setup intent failed"
    return json({ error: msg }, 500)
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
