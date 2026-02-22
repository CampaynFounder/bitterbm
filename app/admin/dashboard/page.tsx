"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { US_STATES } from "@/lib/constants"

type PipelineRun = {
  id: string
  step: string
  status: string
  counts: Record<string, number> | null
  filters: Record<string, unknown> | null
  created_at: string
}

type RawCase = {
  cluster_id: string
  case_name: string | null
  court: string | null
  county: string | null
  judge: string | null
  date_filed: string | null
}

type DashboardState = {
  rawCasesCount: number
  casesWithPlainText: number
  caseChunksCount: number
  lastFetch: PipelineRun | null
  lastChunk: PipelineRun | null
  sampleCases: RawCase[]
  counties: string[]
  judgesCount: number
  judgeChunksCount: number
  lastJudgeExtract: PipelineRun | null
  lastJudgeChunk: PipelineRun | null
}

type TabId = "case-law" | "judge" | "expert" | "attorney" | "filing" | "state-coverage" | "tools" | "county-pipeline" | "scraper" | "superset"

const TABS: { id: TabId; label: string; href?: string }[] = [
  { id: "case-law", label: "Case Law RAG" },
  { id: "judge", label: "Judge RAG" },
  { id: "expert", label: "Expert RAG" },
  { id: "attorney", label: "Attorney RAG" },
  { id: "filing", label: "Filing RAG" },
  { id: "state-coverage", label: "State Coverage" },
  { id: "tools", label: "Tools" },
  { id: "county-pipeline", label: "County Pipeline", href: "/admin/data-pipeline" },
  { id: "scraper", label: "Scraper", href: "/admin/scrape" },
  { id: "superset", label: "Superset", href: "/admin/superset" },
]

function StepCard({
  stepNum,
  title,
  children,
  status,
}: {
  stepNum: number
  title: string
  children: React.ReactNode
  status?: "pending" | "ready" | "done"
}) {
  const statusColor =
    status === "done" ? "var(--accent-cyan)" : status === "ready" ? "var(--accent-gold)" : "var(--border)"
  return (
    <div
      className="rounded-xl border p-5"
      style={{
        background: "var(--bg-card)",
        borderColor: statusColor,
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
          style={{ background: "var(--bg-elevated)", color: "var(--accent-muted)" }}
        >
          {stepNum}
        </span>
        <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h3>
      </div>
      {children}
    </div>
  )
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const pathname = usePathname()
  const [activeTab, setActiveTab] = useState<TabId>("case-law")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [triggerResult, setTriggerResult] = useState<Record<string, number> | null>(null)
  const [chunking, setChunking] = useState(false)
  const [chunkResult, setChunkResult] = useState<Record<string, number> | null>(null)
  const [judgeExtracting, setJudgeExtracting] = useState(false)
  const [judgeChunking, setJudgeChunking] = useState(false)
  const [judgeExtractResult, setJudgeExtractResult] = useState<Record<string, unknown> | null>(null)
  const [judgeChunkResult, setJudgeChunkResult] = useState<Record<string, unknown> | null>(null)
  const [state, setState] = useState<DashboardState | null>(null)
  const [fetchQuery, setFetchQuery] = useState("alienat*")
  const [fetchState, setFetchState] = useState("GA")
  const [fetchMax, setFetchMax] = useState(100)
  const [user, setUser] = useState<{ email?: string } | null>(null)

  const [subUserEmail, setSubUserEmail] = useState("")
  const [subAction, setSubAction] = useState<"grant_flat" | "grant_monthly" | "revoke">("grant_flat")
  const [subLoading, setSubLoading] = useState(false)
  const [subResult, setSubResult] = useState<string | null>(null)

  const [ragQuestion, setRagQuestion] = useState("How do Georgia courts address parental alienation in custody cases?")
  const [ragState, setRagState] = useState("GA")
  const [ragTesting, setRagTesting] = useState(false)
  const [ragResult, setRagResult] = useState<any>(null)
  const [showRetrievedChunks, setShowRetrievedChunks] = useState(false)

  const [stateCoverageSupported, setStateCoverageSupported] = useState<string[]>([])
  const [stateCoverageRequests, setStateCoverageRequests] = useState<{ state_code: string; email: string | null; created_at: string }[]>([])
  const [stateCoverageCounts, setStateCoverageCounts] = useState<Record<string, number>>({})
  const [stateCoverageLoading, setStateCoverageLoading] = useState(false)
  const [stateCoverageSaving, setStateCoverageSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/admin/login")
        return
      }
      setUser(session.user ?? null)
    })
  }, [router])

  useEffect(() => {
    if (!user || activeTab !== "state-coverage") return
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const t = session?.access_token
      if (!t) return
      setStateCoverageLoading(true)
      try {
        const res = await fetch("/api/admin/state-coverage", { headers: { Authorization: `Bearer ${t}` } })
        if (!res.ok) throw new Error("Failed to load")
        const data = await res.json()
        setStateCoverageSupported(data.supportedStates ?? [])
        setStateCoverageRequests(data.requests ?? [])
        setStateCoverageCounts(data.counts ?? {})
      } catch {
        setStateCoverageSupported([])
        setStateCoverageRequests([])
        setStateCoverageCounts({})
      } finally {
        setStateCoverageLoading(false)
      }
    }
    load()
  }, [user, activeTab])

  useEffect(() => {
    if (!user) return
    async function load() {
      setLoading(true)
      setError(null)
      try {
        let judgesCount = 0
        let judgeChunksCount = 0
        let lastJudgeExtract: PipelineRun | null = null
        let lastJudgeChunk: PipelineRun | null = null
        try {
          const [jRes, jcRes, jeRes, jchRes] = await Promise.all([
            supabase.from("judges").select("id", { count: "exact", head: true }),
            supabase.from("judge_analysis_embeddings").select("id", { count: "exact", head: true }),
            supabase.from("pipeline_runs").select("*").eq("step", "extract_judges").order("created_at", { ascending: false }).limit(1).maybeSingle(),
            supabase.from("pipeline_runs").select("*").eq("step", "judge_chunk_embed").order("created_at", { ascending: false }).limit(1).maybeSingle(),
          ])
          judgesCount = jRes.count ?? 0
          judgeChunksCount = jcRes.count ?? 0
          lastJudgeExtract = (jeRes.data as PipelineRun | null) ?? null
          lastJudgeChunk = (jchRes.data as PipelineRun | null) ?? null
        } catch {
          // Schema may not have entity tables yet
        }
        const [rawRes, plainTextRes, chunksRes, fetchRunRes, chunkRunRes, sampleRes] = await Promise.all([
          supabase.from("raw_cases").select("cluster_id", { count: "exact", head: true }),
          supabase.from("raw_cases").select("cluster_id", { count: "exact", head: true }).not("plain_text", "is", null),
          supabase.from("case_chunks").select("id", { count: "exact", head: true }),
          supabase.from("pipeline_runs").select("*").eq("step", "fetch").order("created_at", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("pipeline_runs").select("*").eq("step", "chunk").order("created_at", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("raw_cases").select("cluster_id, case_name, court, county, judge, date_filed").order("date_filed", { ascending: false, nullsFirst: false }).limit(5),
        ])
        const countyRes = await supabase.from("raw_cases").select("county")
        const counties = Array.from(new Set((countyRes.data ?? []).map((r: { county: string | null }) => r.county).filter(Boolean) as string[])).sort()
        setState({
          rawCasesCount: rawRes.count ?? 0,
          casesWithPlainText: plainTextRes.count ?? 0,
          caseChunksCount: chunksRes.count ?? 0,
          lastFetch: (fetchRunRes.data as PipelineRun | null) ?? null,
          lastChunk: (chunkRunRes.data as PipelineRun | null) ?? null,
          sampleCases: (sampleRes.data ?? []) as RawCase[],
          counties,
          judgesCount,
          judgeChunksCount,
          lastJudgeExtract,
          lastJudgeChunk,
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  async function handleTriggerFetch(params: { maxResults?: number; fetchFullText?: boolean; query?: string; state?: string }) {
    const { maxResults, fetchFullText = false, query = "alienat*", state = "GA" } = params
    const max = maxResults ?? fetchMax
    const url = process.env.NEXT_PUBLIC_MODAL_TRIGGER_URL
    const secret = process.env.NEXT_PUBLIC_PIPELINE_TRIGGER_SECRET
    if (!url || !secret) {
      setError("Set NEXT_PUBLIC_MODAL_TRIGGER_URL and NEXT_PUBLIC_PIPELINE_TRIGGER_SECRET")
      return
    }
    setTriggering(true)
    setTriggerResult(null)
    setError(null)
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({
          max_results: Math.min(5000, Math.max(1, max)),
          fetch_full_text: fetchFullText,
          query: (query || "alienat*").trim() || "alienat*",
          state: (state || "GA").trim().toUpperCase() || "GA",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
      setTriggerResult(data)
      const [rawRes, plainTextRes, fetchRunRes, chunkRunRes, chunksRes, sampleRes, countyRes] = await Promise.all([
        supabase.from("raw_cases").select("cluster_id", { count: "exact", head: true }),
        supabase.from("raw_cases").select("cluster_id", { count: "exact", head: true }).not("plain_text", "is", null),
        supabase.from("pipeline_runs").select("*").eq("step", "fetch").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("pipeline_runs").select("*").eq("step", "chunk").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("case_chunks").select("id", { count: "exact", head: true }),
        supabase.from("raw_cases").select("cluster_id, case_name, court, county, judge, date_filed").order("date_filed", { ascending: false, nullsFirst: false }).limit(5),
        supabase.from("raw_cases").select("county"),
      ])
      const counties = Array.from(new Set((countyRes.data ?? []).map((r: { county: string | null }) => r.county).filter(Boolean) as string[])).sort()
      setState((prev) =>
        prev
          ? {
              ...prev,
              rawCasesCount: rawRes.count ?? 0,
              casesWithPlainText: plainTextRes.count ?? 0,
              lastFetch: (fetchRunRes.data as PipelineRun | null) ?? prev.lastFetch,
              lastChunk: (chunkRunRes.data as PipelineRun | null) ?? prev.lastChunk,
              caseChunksCount: chunksRes.count ?? 0,
              sampleCases: (sampleRes.data ?? []) as RawCase[],
              counties,
            }
          : prev
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trigger failed")
    } finally {
      setTriggering(false)
    }
  }

  async function triggerEntityPipeline(action: "chunk_embed" | "extract_judges" | "judge_chunk_embed", stateFilter: string | null) {
    const url = process.env.NEXT_PUBLIC_MODAL_CHUNK_EMBED_URL
    const secret = process.env.NEXT_PUBLIC_PIPELINE_TRIGGER_SECRET
    if (!url || !secret) {
      setError("Set NEXT_PUBLIC_MODAL_CHUNK_EMBED_URL and NEXT_PUBLIC_PIPELINE_TRIGGER_SECRET")
      return null
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ action, state: stateFilter || null }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
    return data
  }

  async function handleTriggerChunkEmbed(stateFilter: string | null) {
    setChunking(true)
    setChunkResult(null)
    setError(null)
    try {
      const data = await triggerEntityPipeline("chunk_embed", stateFilter)
      if (!data) return
      setChunkResult(data)
      const [chunksRes, chunkRunRes] = await Promise.all([
        supabase.from("case_chunks").select("id", { count: "exact", head: true }),
        supabase.from("pipeline_runs").select("*").eq("step", "chunk").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ])
      setState((prev) =>
        prev ? { ...prev, caseChunksCount: chunksRes.count ?? 0, lastChunk: (chunkRunRes.data as PipelineRun | null) ?? prev.lastChunk } : prev
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chunk embed failed")
    } finally {
      setChunking(false)
    }
  }

  async function handleEntityPipeline(action: "extract_judges" | "judge_chunk_embed", stateFilter: string | null) {
    const isExtract = action === "extract_judges"
    if (isExtract) setJudgeExtracting(true)
    else setJudgeChunking(true)
    if (isExtract) setJudgeExtractResult(null)
    else setJudgeChunkResult(null)
    setError(null)
    try {
      const data = await triggerEntityPipeline(action, stateFilter || fetchState || null)
      if (!data) return
      if (isExtract) setJudgeExtractResult(data)
      else setJudgeChunkResult(data)
      const [judgesRes, judgeChunksRes, judgeExtractRunRes, judgeChunkRunRes] = await Promise.all([
        supabase.from("judges").select("id", { count: "exact", head: true }),
        supabase.from("judge_analysis_embeddings").select("id", { count: "exact", head: true }),
        supabase.from("pipeline_runs").select("*").eq("step", "extract_judges").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("pipeline_runs").select("*").eq("step", "judge_chunk_embed").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ])
      setState((prev) =>
        prev
          ? {
              ...prev,
              judgesCount: judgesRes.count ?? 0,
              judgeChunksCount: judgeChunksRes.count ?? 0,
              lastJudgeExtract: (judgeExtractRunRes.data as PipelineRun | null) ?? prev.lastJudgeExtract,
              lastJudgeChunk: (judgeChunkRunRes.data as PipelineRun | null) ?? prev.lastJudgeChunk,
            }
          : prev
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pipeline failed")
    } finally {
      if (isExtract) setJudgeExtracting(false)
      else setJudgeChunking(false)
    }
  }

  async function handleSetSubscription() {
    if (!subUserEmail.trim()) return
    setSubLoading(true)
    setSubResult(null)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/admin/set-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ userEmail: subUserEmail.trim(), action: subAction }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setSubResult(`Success: ${data.email} → ${data.plan}`)
      setSubUserEmail("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setSubLoading(false)
    }
  }

  async function handleSaveSupportedStates() {
    setStateCoverageSaving(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/admin/state-coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ supportedStates: stateCoverageSupported }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setStateCoverageSaving(false)
    }
  }

  async function handleTestRAG() {
    setRagTesting(true)
    setRagResult(null)
    setError(null)
    try {
      const res = await fetch("/api/admin/rag-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: ragQuestion, state: ragState || null, top_k: 10, provider: "openai" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setRagResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "RAG test failed")
    } finally {
      setRagTesting(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.replace("/admin/login")
  }

  if (!user || loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: "80vh" }}>
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      </div>
    )
  }

  const inputStyle = { width: "100%", padding: "var(--space-sm) var(--space-md)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)", fontSize: "0.9375rem" } as const
  const labelStyle = { display: "block", fontSize: "0.8125rem", marginBottom: "var(--space-xs)", color: "var(--text-secondary)" } as const

  return (
    <div style={{ minHeight: "100%", background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <header
        className="sticky top-0 z-10"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}
      >
        <div className="container mx-auto" style={{ maxWidth: 1200 }}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4" style={{ paddingBlock: "var(--space-md)" }}>
            <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-start">
              <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Dashboard</h1>
              <nav className="flex flex-wrap gap-1 justify-center sm:justify-start">
                {TABS.map((t) => {
                  const isActive = t.href ? pathname === t.href : activeTab === t.id
                  const tabStyle = {
                    padding: "var(--space-xs) var(--space-md)",
                    borderRadius: "8px",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    transition: "background 0.15s, color 0.15s",
                    ...(isActive
                      ? { background: "var(--accent-primary)", color: "#fff" }
                      : { background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)" }),
                  }
                  return t.href ? (
                    <Link
                      key={t.id}
                      href={t.href}
                      style={{ ...tabStyle, textDecoration: "none" }}
                      className="hover:opacity-90"
                    >
                      {t.label}
                    </Link>
                  ) : (
                    <button
                      key={t.id}
                      onClick={() => setActiveTab(t.id)}
                      style={tabStyle}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.background = "var(--bg-card)"
                          e.currentTarget.style.color = "var(--text-primary)"
                          e.currentTarget.style.borderColor = "var(--border-accent)"
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.background = "transparent"
                          e.currentTarget.style.color = "var(--text-secondary)"
                          e.currentTarget.style.borderColor = "var(--border)"
                        }
                      }}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </nav>
            </div>
            <div className="flex items-center gap-3 justify-center sm:justify-end" style={{ fontSize: "0.875rem" }}>
              <span style={{ color: "var(--text-primary)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</span>
              <button onClick={handleSignOut} style={{ color: "var(--accent-primary)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Sign out</button>
            </div>
          </div>
        </div>
      </header>

      <main className="section mx-auto" style={{ paddingTop: "var(--space-xl)", paddingBottom: "var(--space-2xl)", maxWidth: 900 }}>
        <div className="container mx-auto" style={{ maxWidth: 900 }}>
        {/* Data creation & scraping pipelines — primary entry for testing */}
        <div
          className="mb-8 p-6 rounded-2xl border-2"
          style={{ background: "var(--bg-card)", borderColor: "var(--accent-primary)", marginBottom: "var(--space-2xl)", padding: "var(--space-lg)", borderRadius: "16px" }}
        >
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "var(--space-sm)", color: "var(--text-primary)" }}>
            Data creation &amp; scraping pipelines
          </h2>
          <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", marginBottom: "var(--space-lg)" }}>
            Configure counties, build supersets, run scrapers, and monitor extraction. Use these for end-to-end testing.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" style={{ gap: "var(--space-md)" }}>
            <Link
              href="/admin/data-pipeline"
              className="block p-5 rounded-xl border-2 transition-all"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--accent-primary)", textDecoration: "none", color: "inherit", padding: "var(--space-lg)", borderRadius: "12px" }}
            >
              <span style={{ fontSize: "1.5rem", display: "block", marginBottom: "var(--space-sm)" }}>🏛️</span>
              <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>County Data Pipeline</strong>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "var(--space-xs)" }}>
                Consolidated workflow: counties → supersets → queue → review. Start here for county court data.
              </p>
            </Link>
            <Link
              href="/admin/scrape"
              className="block p-5 rounded-xl border-2 transition-all"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", textDecoration: "none", color: "inherit", padding: "var(--space-lg)", borderRadius: "12px" }}
            >
              <span style={{ fontSize: "1.5rem", display: "block", marginBottom: "var(--space-sm)" }}>⚡</span>
              <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>Scraper</strong>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "var(--space-xs)" }}>
                Build and run browser automation flows. Save flows, run headless or headed.
              </p>
            </Link>
            <Link
              href="/admin/superset"
              className="block p-5 rounded-xl border-2 transition-all"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", textDecoration: "none", color: "inherit", padding: "var(--space-lg)", borderRadius: "12px" }}
            >
              <span style={{ fontSize: "1.5rem", display: "block", marginBottom: "var(--space-sm)" }}>📦</span>
              <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>Superset</strong>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "var(--space-xs)" }}>
                Define search flows and result configs. Export case ID supersets for scraping.
              </p>
            </Link>
          </div>
        </div>

        {error && (
          <div
            className="mb-4 p-4 rounded-xl"
            style={{ background: "rgba(239, 68, 68, 0.12)", color: "#fca5a5", border: "1px solid rgba(239, 68, 68, 0.35)" }}
          >
            {error}
          </div>
        )}

        {/* Case Law RAG */}
        {activeTab === "case-law" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
            <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>
              CourtListener → raw_cases → chunk + embed → case_chunks. Run steps in order.
            </p>
            <div style={{ display: "grid", gap: "var(--space-lg)" }}>
              <StepCard stepNum={1} title="Fetch from CourtListener" status={state?.lastFetch ? "done" : "pending"}>
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", marginBottom: "var(--space-md)" }}>
                  Fetch cases by state and search term. Use &quot;Fetch + text (RAG)&quot; to store full opinion text for chunking.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" style={{ marginBottom: "var(--space-md)" }}>
                  <div>
                    <label style={labelStyle}>State</label>
                    <select id="fetch-state" value={fetchState} onChange={(e) => setFetchState(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                      <option value="GA">Georgia (GA)</option>
                      <option value="NC">North Carolina (NC)</option>
                      <option value="FL">Florida (FL)</option>
                      <option value="TX">Texas (TX)</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Search term</label>
                    <input id="fetch-query" type="text" value={fetchQuery} onChange={(e) => setFetchQuery(e.target.value)} placeholder="alienat*" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Max results (1–5000)</label>
                    <input id="fetch-max" type="number" min={1} max={5000} value={fetchMax} onChange={(e) => setFetchMax(Math.min(5000, Math.max(1, parseInt(e.target.value, 10) || 1)))} style={inputStyle} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => handleTriggerFetch({ query: fetchQuery, state: fetchState })} disabled={triggering} className="btn-primary" style={{ fontSize: "0.875rem", padding: "var(--space-sm) var(--space-md)" }}>
                    {triggering ? "Running…" : `Fetch ${fetchMax}`}
                  </button>
                  <button onClick={() => handleTriggerFetch({ fetchFullText: true, query: fetchQuery, state: fetchState })} disabled={triggering} style={{ padding: "var(--space-sm) var(--space-md)", borderRadius: "8px", background: "var(--accent-cyan)", color: "#08090c", border: "none", cursor: "pointer", fontWeight: 600, opacity: triggering ? 0.6 : 1 }}>
                    {triggering ? "…" : `Fetch ${fetchMax} + text (RAG)`}
                  </button>
                  {triggerResult && <span style={{ fontSize: "0.9375rem", color: "var(--accent-cyan)" }}>Done: {triggerResult.fetched} fetched, {triggerResult.supabase_stored} stored</span>}
                </div>
                {state?.lastFetch && (
                  <p style={{ marginTop: "var(--space-md)", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                    Last run: {new Date(state.lastFetch.created_at).toLocaleString()}
                    {state.lastFetch.counts && ` · ${state.lastFetch.counts.fetched} fetched, ${state.lastFetch.counts.supabase_stored} stored`}
                  </p>
                )}
              </StepCard>

              <StepCard stepNum={2} title="Storage (raw_cases)" status={state?.casesWithPlainText ? "ready" : "pending"}>
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", marginBottom: "var(--space-sm)" }}>Cases stored in Supabase.</p>
                <p style={{ fontSize: "0.9375rem" }}>
                  <span style={{ color: "var(--text-muted)" }}>Total:</span> {state?.rawCasesCount ?? 0} · <span style={{ color: "var(--text-muted)" }}>RAG-ready (plain text):</span>{" "}
                  <span style={{ color: state?.casesWithPlainText ? "var(--accent-cyan)" : "var(--accent-gold)" }}>{state?.casesWithPlainText ?? 0}</span>
                </p>
                {state?.sampleCases.length ? (
                  <ul style={{ marginTop: "var(--space-sm)", fontSize: "0.8125rem", color: "var(--text-muted)", listStyle: "none", padding: 0 }}>
                    {state.sampleCases.slice(0, 3).map((c) => (
                      <li key={c.cluster_id} style={{ marginBottom: "var(--space-xs)" }}>{c.case_name ?? "—"} ({c.court}, {c.date_filed})</li>
                    ))}
                  </ul>
                ) : null}
              </StepCard>

              <StepCard stepNum={3} title="Chunk + Embed" status={state?.caseChunksCount ? "done" : "pending"}>
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", marginBottom: "var(--space-md)" }}>
                  Chunk training_ready_cases and embed into case_chunks. Requires cases with plain text from Step 1.
                </p>
                <p style={{ fontSize: "0.9375rem", marginBottom: "var(--space-md)" }}><span style={{ color: "var(--text-muted)" }}>Chunks indexed:</span> {state?.caseChunksCount ?? 0}</p>
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => handleTriggerChunkEmbed(fetchState)} disabled={chunking || !state?.casesWithPlainText} style={{ padding: "var(--space-sm) var(--space-md)", borderRadius: "8px", background: "var(--accent-cyan)", color: "#08090c", border: "none", cursor: "pointer", fontWeight: 600, opacity: chunking || !state?.casesWithPlainText ? 0.6 : 1 }}>
                    {chunking ? "Running…" : `Chunk + embed (${fetchState})`}
                  </button>
                  <button onClick={() => handleTriggerChunkEmbed(null)} disabled={chunking || !state?.casesWithPlainText} style={{ padding: "var(--space-sm) var(--space-md)", borderRadius: "8px", background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)", cursor: "pointer", opacity: chunking || !state?.casesWithPlainText ? 0.6 : 1 }}>
                    Chunk + embed (all)
                  </button>
                  {chunkResult && <span style={{ fontSize: "0.9375rem", color: "var(--accent-cyan)" }}>Done: {chunkResult.cases_processed} cases, {chunkResult.chunks_created} chunks</span>}
                </div>
              </StepCard>

              <StepCard stepNum={4} title="Test RAG" status={state?.caseChunksCount ? "ready" : "pending"}>
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", marginBottom: "var(--space-md)" }}>Query case_chunks and validate response quality.</p>
                <textarea value={ragQuestion} onChange={(e) => setRagQuestion(e.target.value)} rows={2} placeholder="e.g. How do Georgia courts address parental alienation?" style={{ ...inputStyle, marginBottom: "var(--space-md)", resize: "vertical" }} />
                <div className="flex flex-wrap items-center gap-3">
                  <select value={ragState} onChange={(e) => setRagState(e.target.value)} style={{ ...inputStyle, width: "auto", maxWidth: 140 }}>
                    <option value="GA">GA</option>
                    <option value="">All</option>
                  </select>
                  <button onClick={handleTestRAG} disabled={ragTesting || !state?.caseChunksCount} className="btn-primary" style={{ fontSize: "0.875rem", padding: "var(--space-sm) var(--space-md)" }}>
                    {ragTesting ? "Running…" : "Test RAG"}
                  </button>
                </div>
                {ragResult && (
                  <div style={{ marginTop: "var(--space-xl)", display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
                    <div style={{ padding: "var(--space-md)", borderRadius: "12px", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                      <div className="flex items-center justify-between" style={{ marginBottom: "var(--space-sm)" }}>
                        <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--accent-cyan)" }}>Answer</span>
                        <button onClick={() => setShowRetrievedChunks(!showRetrievedChunks)} style={{ fontSize: "0.8125rem", color: "var(--accent-muted)", background: "none", border: "none", cursor: "pointer" }}>
                          {showRetrievedChunks ? "Hide" : "Show"} chunks ({ragResult.retrieved_chunks?.length || 0})
                        </button>
                      </div>
                      <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>{ragResult.answer}</p>
                    </div>
                    {showRetrievedChunks && ragResult.retrieved_chunks?.length ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                        {ragResult.retrieved_chunks.slice(0, 5).map((c: any, i: number) => (
                          <div key={i} style={{ padding: "var(--space-sm)", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border)", fontSize: "0.8125rem" }}>
                            <span style={{ color: "var(--text-secondary)" }}>{c.case_name} ({c.date_filed})</span> · sim {c.similarity?.toFixed(2)}
                            <p style={{ color: "var(--text-muted)", marginTop: "var(--space-xs)", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{c.chunk_preview}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </StepCard>
            </div>
          </div>
        )}

        {/* Judge RAG */}
        {activeTab === "judge" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
            <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>
              Extract judges from raw_cases → populate judges table → build judge_analysis_embeddings.
            </p>
            <div style={{ display: "grid", gap: "var(--space-lg)" }}>
              <StepCard stepNum={1} title="Extract judges from raw_cases" status={state?.judgesCount ? "done" : "pending"}>
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", marginBottom: "var(--space-md)" }}>Parse judge names from CourtListener raw_cases into judges + case_participants.</p>
                <p style={{ fontSize: "0.9375rem", marginBottom: "var(--space-md)" }}><span style={{ color: "var(--text-muted)" }}>Judges:</span> {state?.judgesCount ?? 0}</p>
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => handleEntityPipeline("extract_judges", fetchState)} disabled={judgeExtracting || !state?.casesWithPlainText} className="btn-primary" style={{ fontSize: "0.875rem", padding: "var(--space-sm) var(--space-md)" }}>
                    {judgeExtracting ? "Running…" : `Extract judges (${fetchState})`}
                  </button>
                  <button onClick={() => handleEntityPipeline("extract_judges", null)} disabled={judgeExtracting || !state?.casesWithPlainText} style={{ padding: "var(--space-sm) var(--space-md)", borderRadius: "8px", background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)", cursor: "pointer", opacity: judgeExtracting || !state?.casesWithPlainText ? 0.6 : 1 }}>
                    Extract judges (all)
                  </button>
                  {judgeExtractResult && <span style={{ fontSize: "0.9375rem", color: "var(--accent-cyan)" }}>Done: {String(judgeExtractResult.judges_created ?? 0)} judges, {String(judgeExtractResult.case_participants_created ?? 0)} links</span>}
                </div>
              </StepCard>
              <StepCard stepNum={2} title="Enrich judge profiles">
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>Fetch appointment dates, court info, background. Coming soon.</p>
              </StepCard>
              <StepCard stepNum={3} title="Chunk + Embed (judge_analysis_embeddings)" status={state?.judgeChunksCount ? "done" : "pending"}>
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", marginBottom: "var(--space-md)" }}>Build RAG for judicial tendencies from opinion text.</p>
                <p style={{ fontSize: "0.9375rem", marginBottom: "var(--space-md)" }}><span style={{ color: "var(--text-muted)" }}>Chunks:</span> {state?.judgeChunksCount ?? 0}</p>
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => handleEntityPipeline("judge_chunk_embed", fetchState)} disabled={judgeChunking || !state?.judgesCount} className="btn-primary" style={{ fontSize: "0.875rem", padding: "var(--space-sm) var(--space-md)" }}>
                    {judgeChunking ? "Running…" : `Chunk + embed judges (${fetchState})`}
                  </button>
                  <button onClick={() => handleEntityPipeline("judge_chunk_embed", null)} disabled={judgeChunking || !state?.judgesCount} style={{ padding: "var(--space-sm) var(--space-md)", borderRadius: "8px", background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)", cursor: "pointer", opacity: judgeChunking || !state?.judgesCount ? 0.6 : 1 }}>
                    Chunk + embed (all)
                  </button>
                  {judgeChunkResult && <span style={{ fontSize: "0.9375rem", color: "var(--accent-cyan)" }}>Done: {String(judgeChunkResult.judges_processed ?? 0)} judges, {String(judgeChunkResult.chunks_created ?? 0)} chunks</span>}
                </div>
              </StepCard>
              <StepCard stepNum={4} title="Test Judge RAG">
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>Query by judge name + state. Coming soon.</p>
              </StepCard>
            </div>
          </div>
        )}

        {/* Expert RAG */}
        {activeTab === "expert" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
            <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>GALs, psychologists, custody evaluators. Aggregate testimony, reports, credentials.</p>
            <div style={{ display: "grid", gap: "var(--space-lg)" }}>
              <StepCard stepNum={1} title="Ingest expert data">
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>State licensing boards, court transcripts, JurisPro. Coming soon.</p>
              </StepCard>
              <StepCard stepNum={2} title="Build expert profiles (experts table)">
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>Store credentials, type, state, county. Coming soon.</p>
              </StepCard>
              <StepCard stepNum={3} title="Chunk + Embed (expert_profile_embeddings)">
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>RAG for expert persuasion patterns. Coming soon.</p>
              </StepCard>
              <StepCard stepNum={4} title="Test Expert RAG">
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>Query by expert name + role. Coming soon.</p>
              </StepCard>
            </div>
          </div>
        )}

        {/* Attorney RAG */}
        {activeTab === "attorney" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
            <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>Opposing counsel + user&apos;s attorney. Motion patterns, success rates, strategy.</p>
            <div style={{ display: "grid", gap: "var(--space-lg)" }}>
              <StepCard stepNum={1} title="Ingest attorney data">
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>PACER, state bar, case records. Coming soon.</p>
              </StepCard>
              <StepCard stepNum={2} title="Build attorney profiles (attorneys table)">
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>Bar #, practice areas, firm. Coming soon.</p>
              </StepCard>
              <StepCard stepNum={3} title="Chunk + Embed (attorney_intelligence_embeddings)">
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>RAG for briefs, motions, strategies. Coming soon.</p>
              </StepCard>
              <StepCard stepNum={4} title="Test Attorney RAG">
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>Query by attorney name. Coming soon.</p>
              </StepCard>
            </div>
          </div>
        )}

        {/* Filing RAG */}
        {activeTab === "filing" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
            <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>User-uploaded opposing counsel filings. Real-time analysis, rebuttal suggestions.</p>
            <div style={{ display: "grid", gap: "var(--space-lg)" }}>
              <StepCard stepNum={1} title="Upload filing">
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>User uploads PDF. Stored in evidence + filing_embeddings. Coming soon.</p>
              </StepCard>
              <StepCard stepNum={2} title="Parse + chunk">
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>Extract text, chunk by section. Coming soon.</p>
              </StepCard>
              <StepCard stepNum={3} title="Embed (filing_embeddings)">
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>Vector search for rebuttal context. Coming soon.</p>
              </StepCard>
              <StepCard stepNum={4} title="Analyze filing">
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)" }}>Cross-ref with case law, generate rebuttal memo. Coming soon.</p>
              </StepCard>
            </div>
          </div>
        )}

        {/* State Coverage */}
        {activeTab === "state-coverage" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
            <div style={{ padding: "var(--space-xl)", borderRadius: "12px", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "var(--space-md)", color: "var(--accent-muted)" }}>Supported states</h2>
              <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", marginBottom: "var(--space-lg)" }}>
                Toggle which states are shown as supported on the landing page. Add states when AI/case data is ready.
              </p>
              {stateCoverageLoading ? (
                <p style={{ color: "var(--text-muted)" }}>Loading…</p>
              ) : (
                <>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-sm)", marginBottom: "var(--space-lg)" }}>
                    {US_STATES.filter((s) => s.value).map((s) => {
                      const checked = stateCoverageSupported.includes(s.value)
                      return (
                        <label key={s.value} style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)", cursor: "pointer", fontSize: "0.9375rem" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setStateCoverageSupported((prev) =>
                                checked ? prev.filter((x) => x !== s.value) : [...prev, s.value].sort()
                              )
                            }}
                          />
                          {s.label} ({s.value})
                        </label>
                      )
                    })}
                  </div>
                  <button onClick={handleSaveSupportedStates} disabled={stateCoverageSaving} className="btn-primary" style={{ fontSize: "0.875rem", padding: "var(--space-sm) var(--space-md)" }}>
                    {stateCoverageSaving ? "Saving…" : "Save supported states"}
                  </button>
                </>
              )}
            </div>

            <div style={{ padding: "var(--space-xl)", borderRadius: "12px", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "var(--space-md)", color: "var(--accent-muted)" }}>State requests (emails for notification)</h2>
              <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", marginBottom: "var(--space-lg)" }}>
                Users who requested their state. Export emails by state to notify when the model goes live.
              </p>
              {stateCoverageLoading ? (
                <p style={{ color: "var(--text-muted)" }}>Loading…</p>
              ) : stateCoverageRequests.length === 0 ? (
                <p style={{ color: "var(--text-muted)" }}>No requests yet.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9375rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                        <th style={{ padding: "var(--space-sm) var(--space-md)" }}>State</th>
                        <th style={{ padding: "var(--space-sm) var(--space-md)" }}>Email</th>
                        <th style={{ padding: "var(--space-sm) var(--space-md)" }}>Requested</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stateCoverageRequests.map((r, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "var(--space-sm) var(--space-md)" }}>{r.state_code}</td>
                          <td style={{ padding: "var(--space-sm) var(--space-md)", color: "var(--text-secondary)" }}>{r.email ?? "—"}</td>
                          <td style={{ padding: "var(--space-sm) var(--space-md)", color: "var(--text-muted)", fontSize: "0.8125rem" }}>{new Date(r.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {Object.keys(stateCoverageCounts).length > 0 && (
                <p style={{ marginTop: "var(--space-md)", fontSize: "0.875rem", color: "var(--text-muted)" }}>
                  Request counts by state: {Object.entries(stateCoverageCounts)
                    .sort(([, a], [, b]) => b - a)
                    .map(([code, n]) => `${code}: ${n}`)
                    .join(", ")}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Tools */}
        {activeTab === "tools" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
            {/* Data Sources & Approach */}
            <div style={{ padding: "var(--space-xl)", borderRadius: "12px", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "var(--space-md)", color: "var(--accent-muted)" }}>Data Sources & Approach</h2>
              <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", marginBottom: "var(--space-lg)", lineHeight: 1.6 }}>
                How we populate RAG data and what needs to be configured.
              </p>
              <dl style={{ display: "grid", gap: "var(--space-md)", fontSize: "0.9375rem" }}>
                <div>
                  <dt style={{ fontWeight: 600, color: "var(--accent-cyan)", marginBottom: "var(--space-xs)" }}>CourtListener</dt>
                  <dd style={{ color: "var(--text-secondary)" }}>Primary source for case law. Fetch via Modal pipeline (Step 1). Requires COURTLISTENER_API_TOKEN, NEXT_PUBLIC_MODAL_TRIGGER_URL, NEXT_PUBLIC_PIPELINE_TRIGGER_SECRET.</dd>
                </div>
                <div>
                  <dt style={{ fontWeight: 600, color: "var(--accent-cyan)", marginBottom: "var(--space-xs)" }}>Judges</dt>
                  <dd style={{ color: "var(--text-secondary)" }}>Extracted from raw_cases (CourtListener metadata). Enrichment from state court portals—coming soon.</dd>
                </div>
                <div>
                  <dt style={{ fontWeight: 600, color: "var(--accent-cyan)", marginBottom: "var(--space-xs)" }}>Experts (GALs, evaluators)</dt>
                  <dd style={{ color: "var(--text-secondary)" }}>State licensing boards, court transcripts, JurisPro. Pipeline planned.</dd>
                </div>
                <div>
                  <dt style={{ fontWeight: 600, color: "var(--accent-cyan)", marginBottom: "var(--space-xs)" }}>Attorneys</dt>
                  <dd style={{ color: "var(--text-secondary)" }}>PACER (via CourtListener), state bar, case records. Pipeline planned.</dd>
                </div>
                <div>
                  <dt style={{ fontWeight: 600, color: "var(--accent-cyan)", marginBottom: "var(--space-xs)" }}>Filings</dt>
                  <dd style={{ color: "var(--text-secondary)" }}>User-uploaded PDFs → evidence storage + filing_embeddings. Schema ready.</dd>
                </div>
              </dl>
            </div>

            <div style={{ padding: "var(--space-xl)", borderRadius: "12px", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "var(--space-md)", color: "var(--accent-muted)" }}>Scraper</h2>
              <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", marginBottom: "var(--space-md)" }}>
                Configure and run browser automation flows for court sites. Filter by court, judge, case type, status; traverse tables and extract case data.
              </p>
              <Link
                href="/admin/scrape"
                className="btn-primary"
                style={{ display: "inline-block", textDecoration: "none", fontSize: "0.9375rem", padding: "var(--space-sm) var(--space-md)" }}
              >
                Open Scraper
              </Link>
            </div>

            <div style={{ padding: "var(--space-xl)", borderRadius: "12px", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "var(--space-md)", color: "var(--accent-muted)" }}>User subscription</h2>
              <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", marginBottom: "var(--space-lg)" }}>Grant or revoke plan for a user by email.</p>
              <div className="flex flex-wrap items-end gap-3">
                <div style={{ minWidth: 200 }}>
                  <label style={labelStyle}>User email</label>
                  <input type="email" value={subUserEmail} onChange={(e) => setSubUserEmail(e.target.value)} placeholder="user@example.com" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Action</label>
                  <select value={subAction} onChange={(e) => setSubAction(e.target.value as typeof subAction)} style={{ ...inputStyle, cursor: "pointer" }}>
                    <option value="grant_flat">Grant flat</option>
                    <option value="grant_monthly">Grant monthly</option>
                    <option value="revoke">Revoke</option>
                  </select>
                </div>
                <button onClick={handleSetSubscription} disabled={subLoading} className="btn-primary" style={{ fontSize: "0.875rem", padding: "var(--space-sm) var(--space-md)" }}>
                  {subLoading ? "Applying…" : "Apply"}
                </button>
              </div>
              {subResult && <p style={{ marginTop: "var(--space-md)", fontSize: "0.9375rem", color: "var(--accent-cyan)" }}>{subResult}</p>}
            </div>
          </div>
        )}
        </div>
      </main>

      <footer className="container mx-auto text-center" style={{ maxWidth: 1200, paddingBlock: "var(--space-xl)", marginTop: "var(--space-2xl)", borderTop: "1px solid var(--border)", fontSize: "0.9375rem" }}>
        <Link href="/" style={{ color: "var(--accent-primary)" }}>← Back to home</Link>
      </footer>
    </div>
  )
}
