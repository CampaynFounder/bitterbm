/**
 * POST /api/enroll - Charge user for plan (monthly subscription or flat one-time)
 * Requires Authorization: Bearer <token>
 * Body: { plan: "monthly" | "flat" }
 */
import { createClient } from "@supabase/supabase-js"
import Stripe from "stripe"

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  STRIPE_SECRET_KEY: string
  STRIPE_PRICE_MONTHLY: string
  STRIPE_PRICE_FLAT: string
}

export async function onRequestPost(context: {
  request: Request
  env: Env
}): Promise<Response> {
  const { env } = context
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_MONTHLY || !env.STRIPE_PRICE_FLAT) {
    return json({ error: "Stripe prices not configured" }, 500)
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
    const body = await context.request.json() as { plan?: string }
    const plan = body?.plan === "flat" ? "flat" : body?.plan === "monthly" ? "monthly" : null

    if (!plan) {
      return json({ error: "Invalid plan. Use 'monthly' or 'flat'" }, 400)
    }

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, plan, status")
      .eq("user_id", user.id)
      .single()

    if (!sub?.stripe_customer_id) {
      return json({ error: "No Stripe customer. Validate payment method first." }, 400)
    }

    if (sub.plan !== "free" && sub.status === "active") {
      return json({ error: "Already enrolled" }, 400)
    }

    const { data: pm } = await supabase
      .from("payment_methods")
      .select("stripe_payment_method_id")
      .eq("user_id", user.id)
      .eq("is_default", true)
      .maybeSingle()

    if (!pm?.stripe_payment_method_id) {
      return json({ error: "No payment method on file. Add one first." }, 400)
    }

    if (plan === "monthly") {
      const subscription = await stripe.subscriptions.create({
        customer: sub.stripe_customer_id,
        items: [{ price: env.STRIPE_PRICE_MONTHLY }],
        default_payment_method: pm.stripe_payment_method_id,
        metadata: { supabase_user_id: user.id },
        expand: ["latest_invoice.payment_intent"],
      })

      const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null
      const pi = latestInvoice?.payment_intent as Stripe.PaymentIntent | undefined
      if (pi?.status === "requires_action") {
        return json({
          requiresAction: true,
          clientSecret: pi.client_secret,
          subscriptionId: subscription.id,
        })
      }

      return json({
        success: true,
        plan: "monthly",
        subscriptionId: subscription.id,
      })
    }

    // Flat one-time
    const price = await stripe.prices.retrieve(env.STRIPE_PRICE_FLAT)
    const amount = price.unit_amount ?? 59900

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: price.currency ?? "usd",
      customer: sub.stripe_customer_id,
      payment_method: pm.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      metadata: {
        supabase_user_id: user.id,
        plan: "flat",
        stripe_price_id: env.STRIPE_PRICE_FLAT,
      },
    })

    if (paymentIntent.status === "requires_action") {
      return json({
        requiresAction: true,
        clientSecret: paymentIntent.client_secret,
        plan: "flat",
      })
    }

    if (paymentIntent.status === "succeeded") {
      await supabase
        .from("subscriptions")
        .update({
          plan: "flat",
          stripe_price_id: env.STRIPE_PRICE_FLAT,
          status: "active",
          current_period_end: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)

      return json({ success: true, plan: "flat" })
    }

    return json({ error: "Payment did not complete" }, 500)
  } catch (err: unknown) {
    const stripeErr = err as { code?: string; payment_intent?: { client_secret?: string } }
    if (stripeErr.code === "authentication_required" && stripeErr.payment_intent?.client_secret) {
      return json({
        requiresAction: true,
        clientSecret: stripeErr.payment_intent.client_secret,
        plan: "flat",
      })
    }
    console.error("enroll:", err)
    const msg = err instanceof Error ? err.message : "Enroll failed"
    return json({ error: msg }, 500)
  }
}
