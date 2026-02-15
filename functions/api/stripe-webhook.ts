/**
 * POST /api/stripe-webhook - Stripe webhook handler
 * No auth - verified via Stripe-Signature
 */
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET: string
}

export async function onRequestPost(context: {
  request: Request
  env: Env
}): Promise<Response> {
  const { env } = context
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    return json({ error: "Webhook not configured" }, 500)
  }

  const sig = context.request.headers.get("stripe-signature")
  if (!sig) {
    return json({ error: "Missing stripe-signature" }, 400)
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY)
  let event: Stripe.Event

  try {
    const raw = await context.request.text()
    event = stripe.webhooks.constructEvent(raw, sig, env.STRIPE_WEBHOOK_SECRET)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid signature"
    return json({ error: msg }, 400)
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  try {
    switch (event.type) {
      case "setup_intent.succeeded": {
        const si = event.data.object as Stripe.SetupIntent
        const pmId = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id
        const customerId = typeof si.customer === "string" ? si.customer : si.customer?.id
        const userId = si.metadata?.supabase_user_id

        if (pmId && userId) {
          const pm = await stripe.paymentMethods.retrieve(pmId)
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

          const { data: sub } = await supabase
            .from("subscriptions")
            .select("id")
            .eq("user_id", userId)
            .maybeSingle()

          if (sub || customerId) {
            await supabase.from("payment_methods").upsert(
              {
                user_id: userId,
                stripe_payment_method_id: pmId,
                type: pm.type,
                last4: last4 || null,
                brand: brand || null,
                issuer: issuer || null,
                is_default: true,
                pm_metadata: pmMetadata,
              },
              { onConflict: "user_id,stripe_payment_method_id" }
            )
          }
        }
        break
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription & { current_period_end?: number }
        const customerId = sub.customer as string
        const { data: existing } = await supabase
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle()

        if (existing) {
          await supabase
            .from("subscriptions")
            .update({
              stripe_subscription_id: sub.id,
              stripe_price_id: sub.items.data[0]?.price?.id ?? null,
              status: sub.status,
              plan: sub.items.data[0]?.price?.recurring ? "monthly" : "flat",
              current_period_end: sub.current_period_end
                ? new Date(sub.current_period_end * 1000).toISOString()
                : null,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", existing.user_id)
        }
        break
      }

      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent
        const userId = pi.metadata?.supabase_user_id
        const plan = pi.metadata?.plan
        if (userId && plan === "flat") {
          const priceId = pi.metadata?.stripe_price_id ?? null
          await supabase
            .from("subscriptions")
            .update({
              plan: "flat",
              stripe_price_id: priceId,
              status: "active",
              current_period_end: null,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId)
        }
        break
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription
        const customerId = sub.customer as string
        await supabase
          .from("subscriptions")
          .update({
            stripe_subscription_id: null,
            stripe_price_id: null,
            status: "canceled",
            plan: "free",
            current_period_end: null,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", customerId)
        break
      }

      default:
        break
    }
  } catch (err) {
    console.error("Webhook error:", err)
    return json({ error: "Webhook handler failed" }, 500)
  }

  return json({ received: true })
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
