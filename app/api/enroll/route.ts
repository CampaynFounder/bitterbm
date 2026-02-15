import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { stripe } from "@/lib/stripe"

export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 })
  }

  const priceMonthly = process.env.STRIPE_PRICE_MONTHLY
  const priceFlat = process.env.STRIPE_PRICE_FLAT
  if (!priceMonthly || !priceFlat) {
    return NextResponse.json({ error: "Stripe prices not configured" }, { status: 500 })
  }

  const authHeader = req.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = authHeader.slice(7)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({})) as { plan?: string }
    const plan = body?.plan === "flat" ? "flat" : body?.plan === "monthly" ? "monthly" : null

    if (!plan) {
      return NextResponse.json({ error: "Invalid plan. Use 'monthly' or 'flat'" }, { status: 400 })
    }

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, plan, status")
      .eq("user_id", user.id)
      .single()

    if (!sub?.stripe_customer_id) {
      return NextResponse.json({ error: "No Stripe customer. Validate payment method first." }, { status: 400 })
    }

    if (sub.plan !== "free" && sub.status === "active") {
      return NextResponse.json({ error: "Already enrolled" }, { status: 400 })
    }

    const { data: pm } = await supabase
      .from("payment_methods")
      .select("stripe_payment_method_id")
      .eq("user_id", user.id)
      .eq("is_default", true)
      .maybeSingle()

    if (!pm?.stripe_payment_method_id) {
      return NextResponse.json({ error: "No payment method on file. Add one first." }, { status: 400 })
    }

    if (plan === "monthly") {
      const subscription = await stripe.subscriptions.create({
        customer: sub.stripe_customer_id,
        items: [{ price: priceMonthly }],
        default_payment_method: pm.stripe_payment_method_id,
        metadata: { supabase_user_id: user.id },
        expand: ["latest_invoice.payment_intent"],
      })

      const latestInvoice = subscription.latest_invoice as { payment_intent?: { status?: string; client_secret?: string } } | null
      const pi = latestInvoice?.payment_intent
      if (pi?.status === "requires_action" && pi.client_secret) {
        return NextResponse.json({
          requiresAction: true,
          clientSecret: pi.client_secret,
          subscriptionId: subscription.id,
        })
      }

      return NextResponse.json({
        success: true,
        plan: "monthly",
        subscriptionId: subscription.id,
      })
    }

    // Flat one-time
    const price = await stripe.prices.retrieve(priceFlat)
    const amount = price.unit_amount ?? 59900

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: (price.currency as string) ?? "usd",
      customer: sub.stripe_customer_id,
      payment_method: pm.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      metadata: {
        supabase_user_id: user.id,
        plan: "flat",
        stripe_price_id: priceFlat,
      },
    })

    if (paymentIntent.status === "requires_action" && paymentIntent.client_secret) {
      return NextResponse.json({
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
          stripe_price_id: priceFlat,
          status: "active",
          current_period_end: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)

      return NextResponse.json({ success: true, plan: "flat" })
    }

    return NextResponse.json({ error: "Payment did not complete" }, { status: 500 })
  } catch (err: unknown) {
    const stripeErr = err as { code?: string; payment_intent?: { client_secret?: string } }
    if (stripeErr.code === "authentication_required" && stripeErr.payment_intent?.client_secret) {
      return NextResponse.json({
        requiresAction: true,
        clientSecret: stripeErr.payment_intent.client_secret,
        plan: "flat",
      })
    }
    console.error("enroll:", err)
    const msg = err instanceof Error ? err.message : "Enroll failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
