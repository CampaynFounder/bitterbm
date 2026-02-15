import Link from "next/link"

export default function AboutPage() {
  return (
    <main className="section" style={{ minHeight: "80vh", paddingTop: "var(--space-2xl)", paddingBottom: "var(--space-2xl)" }}>
      <div className="container" style={{ maxWidth: 640 }}>
        <Link
          href="/"
          style={{ display: "inline-block", marginBottom: "var(--space-lg)", color: "var(--accent-muted)", fontSize: "0.9375rem", textDecoration: "none" }}
        >
          ← Back
        </Link>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>About BitterBM</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem", lineHeight: 1.6 }}>
          BitterBM helps parents document and prove parental alienation with AI-powered evidence analysis and court-ready reports.
        </p>
      </div>
    </main>
  )
}
