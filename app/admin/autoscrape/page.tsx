"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

const labelStyle = {
  display: "block",
  fontSize: "0.875rem",
  fontWeight: 500,
  marginBottom: "var(--space-xs)",
  color: "var(--text-secondary)",
} as const

const inputStyle = {
  width: "100%",
  padding: "var(--space-sm) var(--space-md)",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  color: "var(--text-primary)",
  fontSize: "1rem",
} as const

const btnSecondary = {
  padding: "var(--space-xs) var(--space-sm)",
  minHeight: 44,
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  color: "var(--text-secondary)",
  cursor: "pointer",
  fontSize: "0.8125rem",
} as const

export default function AdminAutoscrapePage() {
  const router = useRouter()
  const [session, setSession] = useState<{ access_token?: string } | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [adminSecret, setAdminSecret] = useState(() => {
    if (typeof window === "undefined") return ""
    return sessionStorage.getItem("scraper_admin_secret") ?? ""
  })
  const [compileDownloadName, setCompileDownloadName] = useState("")

  const [sessionJson, setSessionJson] = useState("")
  const [contextText, setContextText] = useState("")
  const [captureRulesJson, setCaptureRulesJson] = useState("")
  const [llmProvider, setLlmProvider] = useState<"openai" | "claude">("openai")
  const [compileLoading, setCompileLoading] = useState(false)
  const [compileResult, setCompileResult] = useState<{
    schema?: unknown
    providerUsed?: string
    fallbackOccurred?: boolean
    warnings?: string[]
    error?: string
  } | null>(null)

  const [paramsJson, setParamsJson] = useState("{}")
  const [runLoading, setRunLoading] = useState(false)
  const [runResult, setRunResult] = useState<{
    run_id?: string
    status?: string
    stats?: unknown
    error?: string
  } | null>(null)

  const [savedFlowsList, setSavedFlowsList] = useState<{ id: string; name: string; description?: string; flow_json: unknown }[]>([])
  const [loadModalOpen, setLoadModalOpen] = useState(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveFlowName, setSaveFlowName] = useState("")
  const [saveFlowDescription, setSaveFlowDescription] = useState("")
  const [flowSearch, setFlowSearch] = useState("")
  const [savedFlowsLoading, setSavedFlowsLoading] = useState(false)
  const [saveFlowLoading, setSaveFlowLoading] = useState(false)
  const [saveFlowError, setSaveFlowError] = useState<string | null>(null)

  useEffect(() => {
    if (loadModalOpen && (adminSecret || session?.access_token)) {
      setSavedFlowsLoading(true)
      fetch(`/api/admin/scraper/flows?kind=autoscrape_flow`, { headers: authHeaders() })
        .then((res) => res.json())
        .then((data) => setSavedFlowsList(data.flows ?? []))
        .catch(() => setSavedFlowsList([]))
        .finally(() => setSavedFlowsLoading(false))
    }
  }, [loadModalOpen, adminSecret, session?.access_token])

  const filteredSavedFlows = flowSearch.trim()
    ? savedFlowsList.filter((f) => (f.name ?? "").toLowerCase().includes(flowSearch.trim().toLowerCase()) || (f.description ?? "").toLowerCase().includes(flowSearch.trim().toLowerCase()))
    : savedFlowsList

  async function handleSaveCompiledFlow() {
    if (!compileResult?.schema) { setSaveFlowError("Compile first"); return }
    if (!saveFlowName.trim()) { setSaveFlowError("Name required"); return }
    setSaveFlowLoading(true)
    setSaveFlowError(null)
    try {
      const res = await fetch("/api/admin/scraper/flows", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name: saveFlowName.trim(), description: saveFlowDescription.trim() || undefined, flow_json: compileResult.schema, kind: "autoscrape_flow" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Save failed")
      setSaveModalOpen(false)
      setSaveFlowName("")
      setSaveFlowDescription("")
    } catch (err) {
      setSaveFlowError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaveFlowLoading(false)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s) {
        router.replace("/admin/login")
        return
      }
      setSession(s)
      setSessionReady(true)
    })
  }, [router])

  useEffect(() => {
    if (typeof window !== "undefined" && adminSecret !== undefined) {
      if (adminSecret) sessionStorage.setItem("scraper_admin_secret", adminSecret)
      else sessionStorage.removeItem("scraper_admin_secret")
    }
  }, [adminSecret])

  const authHeaders = () => {
    const h: Record<string, string> = { "Content-Type": "application/json" }
    if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`
    if (adminSecret) h["X-Admin-Secret"] = adminSecret
    return h
  }

  async function handleCompile() {
    let sessionObj: object
    try {
      sessionObj = JSON.parse(sessionJson)
    } catch {
      setCompileResult({ error: "Invalid session JSON" })
      return
    }
    setCompileLoading(true)
    setCompileResult(null)
    try {
      let captureRules: Array<{ field: string; [k: string]: unknown }> | undefined
      if (captureRulesJson.trim()) {
        try {
          captureRules = JSON.parse(captureRulesJson) as Array<{ field: string; [k: string]: unknown }>
          if (!Array.isArray(captureRules)) captureRules = undefined
        } catch {
          setCompileResult({ error: "Invalid capture rules JSON (must be an array)" })
          setCompileLoading(false)
          return
        }
      }
      const res = await fetch("/api/admin/scrape/compile", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          session: sessionObj,
          context: contextText.trim() || undefined,
          captureRules,
          llm_provider: llmProvider,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCompileResult({ error: (data as { error?: string }).error ?? "Compile failed" })
        return
      }
      setCompileResult({
        schema: (data as { schema?: unknown }).schema,
        providerUsed: (data as { providerUsed?: string }).providerUsed,
        fallbackOccurred: (data as { fallbackOccurred?: boolean }).fallbackOccurred,
        warnings: (data as { warnings?: string[] }).warnings,
      })
    } catch (e) {
      setCompileResult({ error: e instanceof Error ? e.message : "Request failed" })
    } finally {
      setCompileLoading(false)
    }
  }

  async function handleRunModal() {
    if (!compileResult?.schema) {
      setRunResult({ error: "Compile first to get a schema" })
      return
    }
    let params: Record<string, unknown> = {}
    try {
      params = JSON.parse(paramsJson)
      if (typeof params !== "object" || params === null) params = {}
    } catch {
      setRunResult({ error: "Invalid params JSON" })
      return
    }
    setRunLoading(true)
    setRunResult(null)
    try {
      const res = await fetch("/api/admin/scrape/run-autoscrape", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          schema: compileResult.schema,
          params,
          run_id: crypto.randomUUID(),
          async: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRunResult({
          error: (data as { error?: string }).error ?? "Run failed",
          run_id: (data as { run_id?: string }).run_id,
        })
        return
      }
      setRunResult({
        run_id: (data as { run_id?: string }).run_id,
        status: (data as { status?: string }).status,
        stats: (data as { stats?: unknown }).stats,
      })
    } catch (e) {
      setRunResult({ error: e instanceof Error ? e.message : "Request failed" })
    } finally {
      setRunLoading(false)
    }
  }

  function handleSessionFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result)
        JSON.parse(text)
        setSessionJson(text)
      } catch {
        setCompileResult({ error: "Invalid JSON file" })
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  function downloadJson(filename: string, data: unknown) {
    const str = typeof data === "string" ? data : JSON.stringify(data, null, 2)
    const blob = new Blob([str], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      <header
        style={{
          padding: "var(--space-sm) var(--space-md)",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-elevated)",
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-sm)" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 700 }}>Autoscrape</h1>
          <Link href="/admin/scrape" style={{ color: "var(--accent-muted)", fontSize: "0.875rem" }}>← Scraper</Link>
          <Link href="/admin/superset" style={{ color: "var(--accent-muted)", fontSize: "0.875rem" }}>Superset</Link>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "var(--space-md)", paddingBottom: "var(--space-2xl)" }}>
        <div style={{ marginBottom: "var(--space-md)", display: "flex", flexWrap: "wrap", gap: "var(--space-md)", alignItems: "flex-end" }}>
          <div>
            <label style={labelStyle}>Admin secret (optional if your email is in ADMIN_EMAILS)</label>
            <input
              type="password"
              value={adminSecret}
              onChange={(e) => setAdminSecret(e.target.value)}
              placeholder="ADMIN_SECRET"
              style={{ ...inputStyle, maxWidth: 280 }}
            />
          </div>
          <div>
            <label style={labelStyle}>Compiled flow filename (for download)</label>
            <input
              type="text"
              value={compileDownloadName}
              onChange={(e) => setCompileDownloadName(e.target.value)}
              placeholder="e.g. cobb-civil"
              style={{ ...inputStyle, maxWidth: 220 }}
              title="Name for the downloaded compiled JSON (e.g. cobb-civil → cobb-civil.json)"
            />
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "var(--space-2xs)", display: "block" }}>
              → {compileDownloadName.trim() ? `${compileDownloadName.trim().replace(/\.json$/i, "")}.json` : "flow.json"}
            </span>
          </div>
        </div>

        <section style={{ padding: "var(--space-md)", borderRadius: "12px", background: "var(--bg-card)", border: "1px solid var(--border)", marginBottom: "var(--space-lg)" }}>
          <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "var(--space-md)" }}>1. Session</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", flexWrap: "wrap", marginBottom: "var(--space-sm)" }}>
            <input type="file" accept=".json,application/json" onChange={handleSessionFile} />
            <button
              type="button"
              onClick={() => {
                try {
                  const parsed = JSON.parse(sessionJson)
                  downloadJson("session.json", parsed)
                } catch {
                  setCompileResult({ error: "Invalid JSON — fix session before downloading" })
                }
              }}
              disabled={!sessionJson.trim()}
              style={{ ...btnSecondary }}
            >
              Download session.json
            </button>
          </div>
          <label style={labelStyle}>Or paste session JSON</label>
          <textarea
            value={sessionJson}
            onChange={(e) => setSessionJson(e.target.value)}
            placeholder='{"meta":{"url":"..."},"snapshots":[...]}'
            style={{ ...inputStyle, minHeight: 120, fontFamily: "monospace", fontSize: "0.8125rem" }}
          />
        </section>

        <section style={{ padding: "var(--space-md)", borderRadius: "12px", background: "var(--bg-card)", border: "1px solid var(--border)", marginBottom: "var(--space-lg)" }}>
          <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "var(--space-md)" }}>2. Optional context & capture rules</h2>
          <label style={labelStyle}>Context (for the LLM)</label>
          <textarea
            value={contextText}
            onChange={(e) => setContextText(e.target.value)}
            placeholder="e.g. We only want rows where type is 'Order'"
            style={{ ...inputStyle, minHeight: 60 }}
          />
          <label style={{ ...labelStyle, marginTop: "var(--space-md)" }}>Capture rules JSON (array, optional)</label>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "var(--space-xs)" }}>
            During recording, use <kbd style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>Ctrl+Shift+C</kbd> then click elements to tag them; session.json will include capture hints.
          </p>
          <div style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-xs)" }}>
            <button
              type="button"
              onClick={() => {
                try {
                  const session = JSON.parse(sessionJson) as { snapshots?: Array<{ session?: { captureHints?: Array<{ field: string; selector?: string; attr?: string; condition?: string; role?: string }> } }> }
                  const hints = (session.snapshots ?? []).flatMap((s) => s.session?.captureHints ?? [])
                  const byField = new Map(hints.map((h) => [h.field, h]))
                  const rules = Array.from(byField.values()).map((h) => ({
                    field: h.field,
                    ...(h.selector && { selector: h.selector }),
                    ...(h.attr && { attr: h.attr }),
                    ...(h.condition && { condition: h.condition }),
                    ...(h.role && { role: h.role }),
                  }))
                  setCaptureRulesJson(JSON.stringify(rules, null, 2))
                } catch {
                  setCaptureRulesJson("")
                }
              }}
              disabled={!sessionJson.trim()}
              style={{ ...btnSecondary, fontSize: "0.75rem" }}
            >
              Use capture hints from session
            </button>
          </div>
          <textarea
            value={captureRulesJson}
            onChange={(e) => setCaptureRulesJson(e.target.value)}
            placeholder='[{"field":"case_number","condition":"..."}]'
            style={{ ...inputStyle, minHeight: 80, fontFamily: "monospace", fontSize: "0.8125rem" }}
          />
        </section>

        <section style={{ padding: "var(--space-md)", borderRadius: "12px", background: "var(--bg-card)", border: "1px solid var(--border)", marginBottom: "var(--space-lg)" }}>
          <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "var(--space-md)" }}>3. Compile</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", flexWrap: "wrap" }}>
            <label style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>LLM provider</label>
            <select
              value={llmProvider}
              onChange={(e) => setLlmProvider(e.target.value as "openai" | "claude")}
              style={{ ...inputStyle, width: 120 }}
            >
              <option value="openai">OpenAI</option>
              <option value="claude">Claude</option>
            </select>
            <button
              type="button"
              onClick={handleCompile}
              disabled={compileLoading || !sessionReady || !sessionJson.trim()}
              className="btn-primary"
              style={{ padding: "var(--space-xs) var(--space-md)" }}
            >
              {compileLoading ? "Compiling…" : "Compile"}
            </button>
          </div>
          {compileResult?.error && <p style={{ marginTop: "var(--space-sm)", color: "var(--accent-gold)" }}>{compileResult.error}</p>}
          {compileResult?.providerUsed && (
            <p style={{ marginTop: "var(--space-xs)", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              Used: {compileResult.providerUsed}
              {compileResult.fallbackOccurred && " (Claude requested but key missing; fell back to OpenAI)"}
            </p>
          )}
          {compileResult?.warnings?.length ? (
            <ul style={{ marginTop: "var(--space-xs)", fontSize: "0.8125rem", color: "var(--accent-gold)" }}>
              {compileResult.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}
          {compileResult?.schema != null ? (
            <div style={{ marginTop: "var(--space-md)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-xs)", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => {
                    const base = compileDownloadName.trim().replace(/\.json$/i, "") || "flow"
                    downloadJson(`${base}.json`, compileResult!.schema)
                  }}
                  style={{ ...btnSecondary, fontSize: "0.8125rem" }}
                >
                  Download {compileDownloadName.trim() ? `${compileDownloadName.trim().replace(/\.json$/i, "")}.json` : "flow.json"}
                </button>
                <button type="button" onClick={() => { setSaveFlowName(compileDownloadName.trim() || "autoscrape-flow"); setSaveFlowDescription(""); setSaveFlowError(null); setSaveModalOpen(true) }} disabled={!compileResult?.schema} style={{ ...btnSecondary, fontSize: "0.8125rem" }}>
                  Save
                </button>
                <button type="button" onClick={() => setLoadModalOpen(true)} style={{ ...btnSecondary, fontSize: "0.8125rem" }}>
                  Load
                </button>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Compiled schema for headed/Modal run</span>
              </div>
              <details>
                <summary style={{ cursor: "pointer", fontSize: "0.875rem" }}>Schema (JSON)</summary>
                <pre style={{ marginTop: "var(--space-sm)", padding: "var(--space-md)", background: "var(--bg-elevated)", borderRadius: "8px", fontSize: "0.75rem", overflow: "auto", maxHeight: 320 }}>
                  {JSON.stringify(compileResult.schema, null, 2)}
                </pre>
              </details>
            </div>
          ) : null}
        </section>

        {saveModalOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: "var(--space-md)" }} onClick={() => setSaveModalOpen(false)}>
            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "1px solid var(--border)", padding: "var(--space-md)", maxWidth: 400, width: "100%" }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-sm)" }}>Save compiled flow</h3>
              <label style={labelStyle}>Name</label>
              <input value={saveFlowName} onChange={(e) => setSaveFlowName(e.target.value)} placeholder="e.g. cobb-civil" style={{ ...inputStyle, marginBottom: "var(--space-sm)" }} />
              <label style={labelStyle}>Description (optional)</label>
              <input value={saveFlowDescription} onChange={(e) => setSaveFlowDescription(e.target.value)} style={{ ...inputStyle, marginBottom: "var(--space-sm)" }} />
              {saveFlowError && <p style={{ fontSize: "0.875rem", color: "var(--accent-gold)", marginBottom: "var(--space-sm)" }}>{saveFlowError}</p>}
              <div style={{ display: "flex", gap: "var(--space-sm)" }}>
                <button type="button" onClick={handleSaveCompiledFlow} disabled={saveFlowLoading} className="btn-primary" style={{ padding: "var(--space-xs) var(--space-sm)" }}>{saveFlowLoading ? "Saving…" : "Save"}</button>
                <button type="button" onClick={() => { setSaveModalOpen(false); setSaveFlowError(null) }} style={btnSecondary}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {loadModalOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: "var(--space-md)" }} onClick={() => setLoadModalOpen(false)}>
            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "1px solid var(--border)", maxWidth: 480, width: "100%", maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: "var(--space-md)", borderBottom: "1px solid var(--border)" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-sm)" }}>Load compiled flow</h3>
                <input type="text" value={flowSearch} onChange={(e) => setFlowSearch(e.target.value)} placeholder="Search by name…" style={inputStyle} />
              </div>
              <div style={{ overflow: "auto", flex: 1, padding: "var(--space-sm)" }}>
                {savedFlowsLoading ? <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Loading…</p> : filteredSavedFlows.length === 0 ? <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>No saved flows</p> : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {filteredSavedFlows.map((f) => (
                      <li key={f.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)", marginBottom: "var(--space-xs)" }}>
                        <button type="button" onClick={() => { setCompileResult({ schema: f.flow_json }); setLoadModalOpen(false); setFlowSearch("") }} style={{ flex: 1, padding: "var(--space-sm)", textAlign: "left", background: "none", border: "none", borderRadius: 8, cursor: "pointer", fontSize: "0.875rem", color: "var(--text-primary)" }} className="hover:bg-[var(--bg-elevated)]">
                          <span style={{ fontWeight: 500 }}>{f.name}</span>
                          {f.description && <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)" }}>{f.description}</span>}
                        </button>
                        <button type="button" onClick={() => { const blob = new Blob([JSON.stringify(f.flow_json, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${(f.name || "flow").replace(/\s+/g, "-")}.json`; a.click(); URL.revokeObjectURL(a.href) }} style={{ ...btnSecondary, padding: "var(--space-xs)", minHeight: 32 }} title="Download">↓</button>
                        <button type="button" onClick={async () => { if (!confirm(`Delete "${f.name}"?`)) return; try { const res = await fetch("/api/admin/scraper/flows", { method: "DELETE", headers: authHeaders(), body: JSON.stringify({ id: f.id }) }); if (!res.ok) throw new Error(); setSavedFlowsList((list) => list.filter((x) => x.id !== f.id)) } catch { setSaveFlowError("Delete failed") } }} style={{ ...btnSecondary, padding: "var(--space-xs)", minHeight: 32, color: "var(--accent-gold)" }} title="Delete">✕</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        <section style={{ padding: "var(--space-md)", borderRadius: "12px", background: "var(--bg-card)", border: "1px solid var(--border)", marginBottom: "var(--space-lg)" }}>
          <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "var(--space-md)" }}>4. Run on Modal</h2>
          <label style={labelStyle}>Params (JSON)</label>
          <textarea
            value={paramsJson}
            onChange={(e) => setParamsJson(e.target.value)}
            placeholder='{"startDate":"2024-01-01","endDate":"2024-01-31"}'
            style={{ ...inputStyle, minHeight: 80, fontFamily: "monospace", fontSize: "0.8125rem" }}
          />
          <button
            type="button"
            onClick={handleRunModal}
            disabled={runLoading || !sessionReady || !compileResult?.schema}
            className="btn-primary"
            style={{ marginTop: "var(--space-sm)", padding: "var(--space-xs) var(--space-md)" }}
          >
            {runLoading ? "Triggering…" : "Run on Modal"}
          </button>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "var(--space-sm)" }}>
            Requires MODAL_AUTOSCRAPE_URL. Deploy: <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>modal deploy scraper/autoscrape/modal_runner.py</code>
          </p>
          {runResult && (
            <div style={{ marginTop: "var(--space-md)", padding: "var(--space-sm)", background: "var(--bg-elevated)", borderRadius: "8px" }}>
              {runResult.error ? (
                <p style={{ color: "var(--accent-gold)" }}>{runResult.error}</p>
              ) : (
                <p style={{ fontSize: "0.875rem" }}>
                  Run ID: <code style={{ background: "var(--bg-primary)", padding: "2px 6px", borderRadius: 4 }}>{runResult.run_id}</code>
                  {runResult.status && ` · Status: ${runResult.status}`}
                </p>
              )}
              {runResult.run_id && <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "var(--space-xs)" }}>Check Modal dashboard for logs.</p>}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
