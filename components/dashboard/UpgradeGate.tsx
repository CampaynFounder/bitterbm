"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { useState } from "react"
import { UpgradeToFlatModal } from "./UpgradeToFlatModal"

type Props = {
  children: React.ReactNode
  plan: string | null
  feature: string
}

export function UpgradeGate({ children, plan, feature }: Props) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)

  if (!plan) return null

  if (plan !== "flat") {
    return (
      <main className="section" style={{ minHeight: "80vh", paddingTop: "var(--space-2xl)", paddingBottom: "var(--space-2xl)" }}>
        <div
          className="container"
          style={{
            maxWidth: 480,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--space-xl)",
            textAlign: "center",
            animation: "fadeInUp 0.4s var(--ease-out-expo) both",
          }}
        >
          <Link href="/dashboard" style={{ alignSelf: "flex-start", color: "var(--accent-muted)", fontSize: "0.9375rem" }}>
            ← Back to Dashboard
          </Link>
          <div
            style={{
              padding: "var(--space-2xl)",
              background: "var(--bg-card)",
              borderRadius: "12px",
              border: "1px solid var(--border)",
              width: "100%",
            }}
          >
            <div style={{ fontSize: "2.5rem", marginBottom: "var(--space-md)" }}>🔒</div>
            <h1 style={{ fontSize: "1.25rem", marginBottom: "var(--space-sm)", color: "var(--text-primary)" }}>
              {feature} requires Flat plan
            </h1>
            <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "var(--space-lg)" }}>
              Upgrade to the flat fee plan to unlock Judge, GAL, County, Attorney, and Filing analysis—plus your cohesive strategy view.
            </p>
            <button
              type="button"
              className="btn-primary"
              style={{ width: "100%", maxWidth: 280 }}
              onClick={() => setShowModal(true)}
            >
              Upgrade to flat
            </button>
          </div>
        </div>
        {showModal && (
          <UpgradeToFlatModal
            feature={feature}
            onClose={() => setShowModal(false)}
            onUpgrade={() => {
              setShowModal(false)
              router.push("/dashboard/payment?upgrade=flat")
            }}
          />
        )}
      </main>
    )
  }

  return <>{children}</>
}
