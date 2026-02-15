"use client"

type Props = {
  onClose: () => void
  onSelectPlan: (plan: "monthly" | "flat") => void
}

export function PricingModal({ onClose, onSelectPlan }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pricing-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "var(--space-lg)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          position: "relative",
          background: "var(--bg-card)",
          borderRadius: "12px",
          border: "1px solid var(--border)",
          padding: "var(--space-xl)",
          maxWidth: 560,
          width: "100%",
          boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
          animation: "modalEnter 200ms ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="pricing-modal-title" style={{ fontSize: "1.25rem", marginBottom: "var(--space-lg)", color: "var(--text-primary)" }}>
          Upgrade to Analyze More Evidence
        </h2>
        <div className="pricing-modal-grid" style={{ display: "grid", gridTemplateColumns: "1fr", gap: "var(--space-lg)" }}>
          <div
            style={{
              padding: "var(--space-xl)",
              background: "var(--bg-elevated)",
              borderRadius: "12px",
              border: "1px solid var(--border)",
              transition: "border-color 150ms, box-shadow 150ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-primary)"
              e.currentTarget.style.boxShadow = "0 0 0 1px var(--accent-glow)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)"
              e.currentTarget.style.boxShadow = "none"
            }}
          >
            <span style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.05em", color: "var(--accent-muted)" }}>Most Flexible</span>
            <h3 style={{ fontSize: "1.25rem", marginTop: "var(--space-xs)", marginBottom: "var(--space-sm)", color: "var(--text-primary)" }}>$49/month</h3>
            <ul style={{ fontSize: "0.9375rem", marginBottom: "var(--space-lg)", paddingLeft: "var(--space-lg)", lineHeight: 1.8 }}>
              <li>Unlimited uploads</li>
              <li>AI case analysis</li>
              <li>Case law matches</li>
              <li>Documentation strategy</li>
            </ul>
            <button type="button" className="btn-primary" style={{ width: "100%" }} onClick={() => onSelectPlan("monthly")}>
              Select Plan
            </button>
          </div>
          <div
            style={{
              padding: "var(--space-xl)",
              background: "var(--bg-elevated)",
              borderRadius: "12px",
              border: "1px solid var(--accent-primary)",
              boxShadow: "0 0 0 1px var(--accent-glow)",
            }}
          >
            <span style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.05em", color: "var(--accent-gold)" }}>Best Value</span>
            <h3 style={{ fontSize: "1.25rem", marginTop: "var(--space-xs)", marginBottom: "var(--space-sm)", color: "var(--text-primary)" }}>$599 one-time</h3>
            <ul style={{ fontSize: "0.9375rem", marginBottom: "var(--space-lg)", paddingLeft: "var(--space-lg)", lineHeight: 1.8 }}>
              <li>Everything in Monthly</li>
              <li>Valid until case resolves</li>
              <li>Judge / GAL analysis</li>
              <li>Your attorney analysis</li>
            </ul>
            <button type="button" className="btn-primary" style={{ width: "100%" }} onClick={() => onSelectPlan("flat")}>
              Select Plan
            </button>
          </div>
        </div>
        <p style={{ marginTop: "var(--space-lg)", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
          Payment method on file—one tap to enroll. $0 charge until you enroll.
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: "var(--space-md)",
            right: "var(--space-md)",
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            fontSize: "1.25rem",
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
