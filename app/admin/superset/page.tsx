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

const defaultSiteConfig = `{
  "siteId": "example",
  "baseUrl": "https://...",
  "iframe": { "selector": "iframe#content" },
  "searchForm": {
    "patternField": { "selector": "#search", "type": "text" },
    "wildcard": "%",
    "minNonWildcardChars": 1,
    "caseSensitive": false,
    "submitSelector": "#btnSearch"
  },
  "patternGeneration": {
    "alphabet": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "length": 3,
    "useWildcard": true,
    "wildcardChar": "%"
  },
  "resultTable": {
    "tableSelector": "table#results",
    "rowSelector": "tbody tr",
    "primaryId": { "source": "column", "columnIndex": 0 },
    "threshold": 5
  },
  "pagination": { "mode": "all_in_dom" }
}
`

const defaultSupersetFlow = `{
  "name": "superset-search",
  "steps": [
    { "type": "navigate", "config": { "url": "https://..." } },
    { "type": "switch_frame", "config": { "selector": "iframe#content" } },
    { "type": "form_fill", "config": { "fields": [], "submit": "#btnSearch" } },
    { "type": "wait", "config": { "selector": "table tbody tr", "timeout": 10000 } }
  ]
}
`

const defaultRetrievalFlow = `{
  "name": "retrieval",
  "steps": [
    { "type": "for_each_id", "config": { "idsVar": "ids", "limit": 0 } },
    { "type": "navigate", "config": { "url": "https://.../detail/{{current_id}}" } },
    { "type": "extract_field", "config": { "fieldId": "case_number", "selector": ".case-num", "attr": "text" } },
    { "type": "extract_pdf", "config": { "fieldId": "pdf_url", "screenshot": true } },
    { "type": "store_row", "config": {} }
  ]
}
`

/** Minimal flow that hits example.com so Phase 2 can be tested without a real target site. */
const quickTestRetrievalFlow = `{
  "name": "retrieval-quick-test",
  "steps": [
    { "type": "for_each_id", "config": { "idsVar": "ids", "limit": 0 } },
    { "type": "navigate", "config": { "url": "https://example.com/#{{current_id}}" } },
    { "type": "wait", "config": { "selector": "h1", "timeout": 5000 } },
    { "type": "extract_field", "config": { "fieldId": "page_title", "selector": "h1", "attr": "text" } },
    { "type": "store_row", "config": {} }
  ]
}
`
const quickTestIds = '["test-1", "test-2"]'

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

export default function AdminSupersetPage() {
  const router = useRouter()
  const [session, setSession] = useState<{ access_token?: string } | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [adminSecret, setAdminSecret] = useState(() => {
    if (typeof window === "undefined") return ""
    return sessionStorage.getItem("scraper_admin_secret") ?? ""
  })

  const [supersetFlowJson, setSupersetFlowJson] = useState(defaultSupersetFlow)
  const [siteConfigJson, setSiteConfigJson] = useState(defaultSiteConfig)

  const [idsInput, setIdsInput] = useState("")
  const [retrievalFlowJson, setRetrievalFlowJson] = useState(defaultRetrievalFlow)
  const [retrievalLoading, setRetrievalLoading] = useState(false)
  const [retrievalResult, setRetrievalResult] = useState<{ jobId?: string; rowsStored?: number; pdfDocumentsStored?: number; error?: string; logs?: string[] } | null>(null)

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

  function handleSupersetFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result))
        const ids = data.ids ?? (Array.isArray(data) ? data : [])
        setIdsInput(JSON.stringify(ids, null, 2))
      } catch {
        setRetrievalResult({ error: "Invalid superset JSON" })
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  async function handleRunRetrieval() {
    let ids: string[] = []
    try {
      const trimmed = idsInput.trim()
      if (trimmed) {
        const parsed = JSON.parse(trimmed)
        ids = Array.isArray(parsed) ? parsed : parsed?.ids ?? []
      }
    } catch {
      setRetrievalResult({ error: "Invalid ids JSON (use [\"id1\", \"id2\"] or superset file with .ids)" })
      return
    }

    let flow: { name?: string; steps: unknown[] }
    try {
      flow = JSON.parse(retrievalFlowJson)
      if (!flow?.steps?.length) throw new Error("flow.steps required")
    } catch (e) {
      setRetrievalResult({ error: "Invalid retrieval flow JSON" })
      return
    }

    setRetrievalLoading(true)
    setRetrievalResult(null)
    try {
      const res = await fetch("/api/admin/scrape/run", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          flow,
          ids: ids.length > 0 ? ids : undefined,
          vars: {},
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRetrievalResult({ error: (data as { error?: string }).error ?? "Run failed" })
        return
      }
      setRetrievalResult({
        jobId: (data as { jobId?: string }).jobId,
        rowsStored: (data as { rowsStored?: number }).rowsStored,
        pdfDocumentsStored: (data as { pdfDocumentsStored?: number }).pdfDocumentsStored,
        error: (data as { error?: string }).error,
        logs: (data as { logs?: string[] }).logs,
      })
    } catch (e) {
      setRetrievalResult({ error: e instanceof Error ? e.message : "Request failed" })
    } finally {
      setRetrievalLoading(false)
    }
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
          <h1 style={{ fontSize: "1.125rem", fontWeight: 700 }}>Superset builder & retrieval</h1>
          <div style={{ display: "flex", gap: "var(--space-sm)" }}>
            <Link href="/admin/autoscrape" style={{ color: "var(--accent-muted)", fontSize: "0.875rem" }}>
              Autoscrape
            </Link>
            <Link href="/admin/scrape" style={{ color: "var(--accent-muted)", fontSize: "0.875rem" }}>
              Scraper
            </Link>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "var(--space-md)", paddingBottom: "var(--space-2xl)" }}>
        <div style={{ marginBottom: "var(--space-md)" }}>
          <label style={labelStyle}>Admin secret (optional)</label>
          <input
            type="password"
            value={adminSecret}
            onChange={(e) => setAdminSecret(e.target.value)}
            placeholder="ADMIN_SECRET"
            style={{ ...inputStyle, maxWidth: 280 }}
          />
        </div>

        <section style={{ padding: "var(--space-md)", borderRadius: "12px", background: "var(--bg-card)", border: "1px solid var(--border)", marginBottom: "var(--space-lg)" }}>
          <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "var(--space-md)" }}>1. Superset flow & site config (Phase 1)</h2>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "var(--space-md)" }}>
            Configure the Playwright flow that runs one search (navigate, switch frame, form fill, submit). Use with the Phase 1 script to build superset files locally. See{" "}
            <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>docs/SCRAPER_SUPERSET_ARCHITECTURE.md</code>.
          </p>
          <label style={labelStyle}>Superset flow (one search)</label>
          <textarea
            value={supersetFlowJson}
            onChange={(e) => setSupersetFlowJson(e.target.value)}
            style={{ ...inputStyle, minHeight: 140, fontFamily: "monospace", fontSize: "0.8125rem" }}
          />
          <div style={{ display: "flex", gap: "var(--space-sm)", marginTop: "var(--space-sm)" }}>
            <button type="button" onClick={() => { try { downloadJson("superset-flow.json", JSON.parse(supersetFlowJson)) } catch { setRetrievalResult({ error: "Invalid flow JSON" }) } }} style={btnSecondary}>
              Download flow.json
            </button>
          </div>
          <label style={{ ...labelStyle, marginTop: "var(--space-md)" }}>Site config (pattern, threshold, selectors)</label>
          <textarea
            value={siteConfigJson}
            onChange={(e) => setSiteConfigJson(e.target.value)}
            style={{ ...inputStyle, minHeight: 220, fontFamily: "monospace", fontSize: "0.8125rem" }}
          />
          <div style={{ display: "flex", gap: "var(--space-sm)", marginTop: "var(--space-sm)" }}>
            <button type="button" onClick={() => { try { downloadJson("site-config.json", JSON.parse(siteConfigJson)) } catch { setRetrievalResult({ error: "Invalid config JSON" }) } }} style={btnSecondary}>
              Download site-config.json
            </button>
          </div>
        </section>

        <section style={{ padding: "var(--space-md)", borderRadius: "12px", background: "var(--bg-card)", border: "1px solid var(--border)", marginBottom: "var(--space-lg)" }}>
          <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "var(--space-md)" }}>2. Retrieval with ids (Phase 2)</h2>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "var(--space-md)" }}>
            Use an <strong>existing retrieval flow</strong> that starts with <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>for_each_id</code> (idsVar: &quot;ids&quot;). Pass a list of ids from a superset file or paste a JSON array. Metadata and PDF screenshots are stored in the DB.
          </p>
          <label style={labelStyle}>Ids (from superset file or paste JSON array)</label>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-xs)", flexWrap: "wrap" }}>
            <input type="file" accept=".json,application/json" onChange={handleSupersetFile} />
            <button
              type="button"
              onClick={() => {
                setIdsInput(quickTestIds)
                setRetrievalFlowJson(quickTestRetrievalFlow)
                setRetrievalResult(null)
              }}
              style={btnSecondary}
            >
              Fill quick test (example.com)
            </button>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Upload superset JSON (uses .ids) or paste below</span>
          </div>
          <textarea
            value={idsInput}
            onChange={(e) => setIdsInput(e.target.value)}
            placeholder='["id1", "id2", "id3"]'
            style={{ ...inputStyle, minHeight: 80, fontFamily: "monospace", fontSize: "0.8125rem" }}
          />
          <label style={{ ...labelStyle, marginTop: "var(--space-md)" }}>Retrieval flow (must have for_each_id with idsVar: &quot;ids&quot;)</label>
          <textarea
            value={retrievalFlowJson}
            onChange={(e) => setRetrievalFlowJson(e.target.value)}
            style={{ ...inputStyle, minHeight: 180, fontFamily: "monospace", fontSize: "0.8125rem" }}
          />
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "var(--space-xs)" }}>
            Use <code>{`{{current_id}}`}</code> in steps (e.g. navigate URL). Build this flow in <Link href="/admin/scrape" style={{ color: "var(--accent-muted)" }}>Scraper</Link> and paste here, or paste a saved flow.json.
          </p>
          <button
            type="button"
            onClick={handleRunRetrieval}
            disabled={retrievalLoading || !sessionReady}
            className="btn-primary"
            style={{ marginTop: "var(--space-sm)", padding: "var(--space-xs) var(--space-md)" }}
          >
            {retrievalLoading ? "Running…" : "Run retrieval (API)"}
          </button>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "var(--space-sm)" }}>
            Runs headless via API. For a visible browser (e.g. login), run: <code style={{ background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>npx tsx scripts/run-scraper-headed.ts flow.json --ids-file superset.json</code>.
          </p>
          {retrievalResult && (
            <div style={{ marginTop: "var(--space-md)", padding: "var(--space-sm)", background: "var(--bg-elevated)", borderRadius: "8px" }}>
              {retrievalResult.error ? (
                <p style={{ color: "var(--accent-gold)" }}>{retrievalResult.error}</p>
              ) : (
                <p style={{ fontSize: "0.875rem" }}>
                  Job: <code style={{ background: "var(--bg-primary)", padding: "2px 6px", borderRadius: 4 }}>{retrievalResult.jobId}</code>
                  {retrievalResult.rowsStored != null && ` · Rows: ${retrievalResult.rowsStored}`}
                  {retrievalResult.pdfDocumentsStored != null && ` · PDFs: ${retrievalResult.pdfDocumentsStored}`}
                </p>
              )}
              {retrievalResult.logs?.length ? (
                <details style={{ marginTop: "var(--space-sm)" }}>
                  <summary style={{ cursor: "pointer", fontSize: "0.8125rem" }}>Logs</summary>
                  <pre style={{ marginTop: "var(--space-xs)", fontSize: "0.75rem", overflow: "auto", maxHeight: 200 }}>{retrievalResult.logs.join("\n")}</pre>
                </details>
              ) : null}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
