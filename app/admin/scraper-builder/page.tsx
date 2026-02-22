"use client"

import { useState } from "react"

const inputStyle = {
  width: "100%",
  padding: "var(--space-sm)",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
}

const btnPrimary = {
  padding: "var(--space-sm) var(--space-md)",
  borderRadius: 8,
  border: "none",
  background: "var(--accent-primary)",
  color: "white",
  fontSize: "0.875rem",
  fontWeight: 500,
  cursor: "pointer",
}

const btnSecondary = {
  padding: "var(--space-sm) var(--space-md)",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  cursor: "pointer",
}

export default function ScraperBuilderPage() {
  const [url, setUrl] = useState("")
  const [description, setDescription] = useState("")
  const [state, setState] = useState("")
  const [county, setCounty] = useState("")
  const [authPause, setAuthPause] = useState(0)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    config?: any
    screenshot?: string
    elements?: any[]
    error?: string
  } | null>(null)
  const [selectedElements, setSelectedElements] = useState<Set<number>>(new Set())

  async function handleAnalyze() {
    if (!url.trim()) {
      setResult({ error: "URL is required" })
      return
    }
    if (!description.trim()) {
      setResult({ error: "Description of what to scrape is required" })
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const res = await fetch("/api/admin/scraper/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          description,
          state: state.trim() || undefined,
          county: county.trim() || undefined,
          authPause: authPause || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Analysis failed")

      setResult({
        config: data.config,
        screenshot: data.screenshot,
        elements: data.elements,
      })
    } catch (err: any) {
      setResult({ error: err.message })
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!result?.config) return

    try {
      const name = `${state || "Unknown"} ${county || ""} - ${new Date().toISOString().split("T")[0]}`.trim()
      const res = await fetch("/api/admin/scraper/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: `Auto-generated: ${description}`,
          flow_json: result.config,
          kind: "superset_e2e",
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Save failed")

      alert("✅ Scraper saved successfully!")
    } catch (err: any) {
      alert(`❌ Save failed: ${err.message}`)
    }
  }

  function handleElementClick(index: number) {
    const newSelected = new Set(selectedElements)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedElements(newSelected)
  }

  return (
    <div style={{ minHeight: "100vh", padding: "var(--space-lg)", background: "var(--bg-primary)" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>
          Visual Scraper Builder
        </h1>
        <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "var(--space-lg)" }}>
          Analyze a webpage and generate a scraper configuration using AI. Describe what data you want to extract, and the system will suggest selectors and build a complete flow.
        </p>

        {/* Input Form */}
        <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: "var(--space-lg)", marginBottom: "var(--space-lg)", border: "1px solid var(--border)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "var(--space-xs)", color: "var(--text-secondary)" }}>
                Target URL *
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/search"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "var(--space-xs)", color: "var(--text-secondary)" }}>
                Auth Pause (seconds)
              </label>
              <input
                type="number"
                value={authPause}
                onChange={(e) => setAuthPause(parseInt(e.target.value) || 0)}
                placeholder="0"
                style={inputStyle}
                title="Seconds to pause for manual login"
              />
            </div>
          </div>

          <div style={{ marginBottom: "var(--space-md)" }}>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "var(--space-xs)", color: "var(--text-secondary)" }}>
              What to scrape *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="case number, judge name, filing date, PDF documents"
              style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "var(--space-xs)", color: "var(--text-secondary)" }}>
                State (optional)
              </label>
              <input
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="GA"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "var(--space-xs)", color: "var(--text-secondary)" }}>
                County (optional)
              </label>
              <input
                value={county}
                onChange={(e) => setCounty(e.target.value)}
                placeholder="Cobb"
                style={inputStyle}
              />
            </div>
          </div>

          <button onClick={handleAnalyze} disabled={loading} style={btnPrimary}>
            {loading ? "Analyzing..." : "🔍 Analyze Page & Generate Scraper"}
          </button>
        </div>

        {/* Results */}
        {result?.error && (
          <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: "var(--space-lg)", marginBottom: "var(--space-lg)", border: "1px solid var(--accent-gold)", color: "var(--accent-gold)" }}>
            <strong>Error:</strong> {result.error}
          </div>
        )}

        {result && !result.error && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)" }}>
            {/* Screenshot & Elements */}
            <div>
              <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: "var(--space-lg)", border: "1px solid var(--border)", marginBottom: "var(--space-md)" }}>
                <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>
                  Page Screenshot
                </h2>
                {result.screenshot && (
                  <img
                    src={result.screenshot}
                    alt="Page screenshot"
                    style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)" }}
                  />
                )}
              </div>

              {result.elements && result.elements.length > 0 && (
                <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: "var(--space-lg)", border: "1px solid var(--border)" }}>
                  <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "var(--space-md)", color: "var(--text-primary)" }}>
                    Found Elements ({result.elements.length})
                  </h2>
                  <div style={{ maxHeight: 400, overflow: "auto" }}>
                    {result.elements.map((elem, i) => (
                      <div
                        key={i}
                        onClick={() => handleElementClick(i)}
                        style={{
                          padding: "var(--space-xs)",
                          marginBottom: "var(--space-xs)",
                          borderRadius: 6,
                          border: `1px solid ${selectedElements.has(i) ? "var(--accent-primary)" : "var(--border)"}`,
                          background: selectedElements.has(i) ? "rgba(79, 70, 229, 0.1)" : "var(--bg-elevated)",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                        }}
                      >
                        <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                          {elem.type}
                          {elem.id && ` #${elem.id}`}
                        </div>
                        <div style={{ color: "var(--text-muted)", marginTop: 2 }}>
                          {elem.selector}
                        </div>
                        {elem.text && (
                          <div style={{ color: "var(--text-muted)", marginTop: 2, fontStyle: "italic" }}>
                            "{elem.text.slice(0, 60)}..."
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Generated Config */}
            <div>
              <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: "var(--space-lg)", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
                  <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    Generated Configuration
                  </h2>
                  <button onClick={handleSave} style={btnSecondary}>
                    💾 Save to Database
                  </button>
                </div>
                <pre
                  style={{
                    background: "var(--bg-elevated)",
                    borderRadius: 8,
                    padding: "var(--space-md)",
                    fontSize: "0.75rem",
                    overflow: "auto",
                    maxHeight: 600,
                    fontFamily: "monospace",
                    color: "var(--text-primary)",
                  }}
                >
                  {JSON.stringify(result.config, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
