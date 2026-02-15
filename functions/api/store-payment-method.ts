/**
 * POST /api/store-payment-method - Store Stripe PM details after validation
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
    const body = await context.request.json() as { paymentMethodId: string }
    const { paymentMethodId } = body
    if (!paymentMethodId) {
      return json({ error: "Missing paymentMethodId" }, 400)
    }

    const pm = await stripe.paymentMethods.retrieve(paymentMethodId)
    if (pm.customer !== null && typeof pm.customer === "string") {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle()
      if (sub?.stripe_customer_id !== pm.customer) {
        return json({ error: "Payment method does not belong to this user" }, 403)
      }
    }

    const type = pm.type
    let last4 = ""
    let brand = ""
    let issuer = ""
    const pmMetadata: Record<string, unknown> = {}

    if (pm.card) {
      last4 = pm.card.last4 ?? ""
      brand = pm.card.brand ?? ""
      issuer = (pm.card as { issuer?: string }).issuer ?? ""
      pmMetadata.network = (pm.card as { network?: string }).network
      pmMetadata.funding = (pm.card as { funding?: string }).funding
    } else if (pm.type === "klarna") {
      pmMetadata.type = "klarna"
    } else if (pm.type === "cashapp") {
      pmMetadata.type = "cashapp"
    }

    await supabase.from("payment_methods").update({ is_default: false }).eq("user_id", user.id)
    await supabase.from("payment_methods").upsert(
      {
        user_id: user.id,
        stripe_payment_method_id: paymentMethodId,
        type,
        last4: last4 || null,
        brand: brand || null,
        issuer: issuer || null,
        is_default: true,
        pm_metadata: pmMetadata,
      },
      { onConflict: "user_id,stripe_payment_method_id" }
    )

    return json({
      success: true,
      paymentMethod: { type, last4, brand, issuer, pm_metadata: pmMetadata },
    })
  } catch (err: unknown) {
    console.error("store-payment-method:", err)
    const msg = err instanceof Error ? err.message : "Failed to store payment method"
    return json({ error: msg }, 500)
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
