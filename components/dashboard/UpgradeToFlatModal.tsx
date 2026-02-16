"use client"

type Props = {
  onClose: () => void
  onUpgrade: () => void
  feature?: string
}

export function UpgradeToFlatModal({ onClose, onUpgrade, feature = "this feature" }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
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
          maxWidth: 420,
          width: "100%",
          boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
          animation: "modalEnter 200ms ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="upgrade-modal-title" style={{ fontSize: "1.25rem", marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>
          Upgrade to Flat Fee
        </h2>
        <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "var(--space-lg)" }}>
          {feature} is available on the flat fee plan. Upgrade once to unlock all analysis types—Judge, GAL, County, Attorney, Filing—and your cohesive strategy view.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          <button type="button" className="btn-primary" style={{ width: "100%" }} onClick={onUpgrade}>
            Upgrade to $599 flat fee
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: "100%",
              padding: "var(--space-sm)",
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              fontSize: "0.9375rem",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Maybe later
          </button>
        </div>
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
