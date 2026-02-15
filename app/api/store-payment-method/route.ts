import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { stripe } from "@/lib/stripe"

export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 })
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
    const body = await req.json() as { paymentMethodId: string }
    const { paymentMethodId } = body
    if (!paymentMethodId) {
      return NextResponse.json({ error: "Missing paymentMethodId" }, { status: 400 })
    }

    const pm = await stripe.paymentMethods.retrieve(paymentMethodId)
    if (pm.customer !== null && typeof pm.customer === "string") {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle()
      if (sub?.stripe_customer_id !== pm.customer) {
        return NextResponse.json({ error: "Payment method does not belong to this user" }, { status: 403 })
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

    return NextResponse.json({
      success: true,
      paymentMethod: {
        type,
        last4,
        brand,
        issuer,
        pm_metadata: pmMetadata,
      },
    })
  } catch (err: unknown) {
    console.error("store-payment-method:", err)
    const msg = err instanceof Error ? err.message : "Failed to store payment method"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
