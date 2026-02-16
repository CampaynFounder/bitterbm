"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

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
}

type TabId = "case-law" | "judge" | "expert" | "attorney" | "filing" | "tools"

const TABS: { id: TabId; label: string }[] = [
  { id: "case-law", label: "Case Law RAG" },
  { id: "judge", label: "Judge RAG" },
  { id: "expert", label: "Expert RAG" },
  { id: "attorney", label: "Attorney RAG" },
  { id: "filing", label: "Filing RAG" },
  { id: "tools", label: "Tools" },
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
    status === "done" ? "border-emerald-600/50" : status === "ready" ? "border-amber-500/50" : "border-gray-700"
  return (
    <div className={`rounded-lg border bg-[#0d0d0d] p-4 ${statusColor}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-800 text-xs font-semibold text-gray-300">
          {stepNum}
        </span>
        <h3 className="font-medium text-white">{title}</h3>
      </div>
      {children}
    </div>
  )
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabId>("case-law")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [triggerResult, setTriggerResult] = useState<Record<string, number> | null>(null)
  const [chunking, setChunking] = useState(false)
  const [chunkResult, setChunkResult] = useState<Record<string, number> | null>(null)
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
    if (!user) return
    async function load() {
      setLoading(true)
      setError(null)
      try {
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

  async function handleTriggerChunkEmbed(stateFilter: string | null) {
    const url = process.env.NEXT_PUBLIC_MODAL_CHUNK_EMBED_URL
    const secret = process.env.NEXT_PUBLIC_PIPELINE_TRIGGER_SECRET
    if (!url || !secret) {
      setError("Set NEXT_PUBLIC_MODAL_CHUNK_EMBED_URL and NEXT_PUBLIC_PIPELINE_TRIGGER_SECRET")
      return
    }
    setChunking(true)
    setChunkResult(null)
    setError(null)
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ state: stateFilter || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
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
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white">
        <p className="text-gray-400">Loading…</p>
      </div>
    )
  }

  const inputClass = "w-full px-3 py-2 rounded bg-[#0a0a0a] border border-gray-700 text-sm text-white placeholder-gray-500"
  const labelClass = "block text-xs text-gray-500 mb-1"
  const btnPrimary = "px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium"
  const btnSecondary = "px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm"

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-[#0a0a0a]/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <h1 className="text-lg font-semibold">Admin</h1>
              <nav className="flex flex-wrap gap-1">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      activeTab === t.id ? "bg-amber-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-500 truncate max-w-[180px]">{user.email}</span>
              <button onClick={handleSignOut} className="text-amber-500 hover:text-amber-400">
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-3 rounded bg-red-900/30 text-red-300 border border-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Case Law RAG */}
        {activeTab === "case-law" && (
          <div className="space-y-6">
            <p className="text-sm text-gray-400">
              CourtListener → raw_cases → chunk + embed → case_chunks. Run steps in order.
            </p>
            <div className="grid gap-4">
              <StepCard stepNum={1} title="Fetch from CourtListener" status={state?.lastFetch ? "done" : "pending"}>
                <p className="text-sm text-gray-400 mb-3">
                  Fetch cases by state and search term. Use &quot;Fetch + text (RAG)&quot; to store full opinion text for chunking.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className={labelClass}>State</label>
                    <select id="fetch-state" value={fetchState} onChange={(e) => setFetchState(e.target.value)} className={inputClass}>
                      <option value="GA">Georgia (GA)</option>
                      <option value="NC">North Carolina (NC)</option>
                      <option value="FL">Florida (FL)</option>
                      <option value="TX">Texas (TX)</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Search term</label>
                    <input
                      id="fetch-query"
                      type="text"
                      value={fetchQuery}
                      onChange={(e) => setFetchQuery(e.target.value)}
                      placeholder="alienat*"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Max results (1–5000)</label>
                    <input
                      id="fetch-max"
                      type="number"
                      min={1}
                      max={5000}
                      value={fetchMax}
                      onChange={(e) => setFetchMax(Math.min(5000, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => handleTriggerFetch({ query: fetchQuery, state: fetchState })} disabled={triggering} className={btnPrimary}>
                    {triggering ? "Running…" : `Fetch ${fetchMax}`}
                  </button>
                  <button
                    onClick={() => handleTriggerFetch({ fetchFullText: true, query: fetchQuery, state: fetchState })}
                    disabled={triggering}
                    className={btnSecondary}
                  >
                    {triggering ? "…" : `Fetch ${fetchMax} + text (RAG)`}
                  </button>
                  {triggerResult && (
                    <span className="text-sm text-green-400">
                      Done: {triggerResult.fetched} fetched, {triggerResult.supabase_stored} stored
                    </span>
                  )}
                </div>
                {state?.lastFetch && (
                  <p className="mt-2 text-xs text-gray-500">
                    Last run: {new Date(state.lastFetch.created_at).toLocaleString()}
                    {state.lastFetch.counts && ` · ${state.lastFetch.counts.fetched} fetched, ${state.lastFetch.counts.supabase_stored} stored`}
                  </p>
                )}
              </StepCard>

              <StepCard stepNum={2} title="Storage (raw_cases)" status={state?.casesWithPlainText ? "ready" : "pending"}>
                <p className="text-sm text-gray-400 mb-2">Cases stored in Supabase.</p>
                <p className="text-sm">
                  <span className="text-gray-500">Total:</span> {state?.rawCasesCount ?? 0} ·{" "}
                  <span className="text-gray-500">RAG-ready (plain text):</span>{" "}
                  <span className={state?.casesWithPlainText ? "text-emerald-400" : "text-amber-400"}>{state?.casesWithPlainText ?? 0}</span>
                </p>
                {state?.sampleCases.length ? (
                  <ul className="mt-2 text-xs text-gray-400 space-y-0.5">
                    {state.sampleCases.slice(0, 3).map((c) => (
                      <li key={c.cluster_id}>
                        {c.case_name ?? "—"} ({c.court}, {c.date_filed})
                      </li>
                    ))}
                  </ul>
                ) : null}
              </StepCard>

              <StepCard stepNum={3} title="Chunk + Embed" status={state?.caseChunksCount ? "done" : "pending"}>
                <p className="text-sm text-gray-400 mb-3">
                  Chunk training_ready_cases and embed into case_chunks. Requires cases with plain text from Step 1.
                </p>
                <p className="text-sm mb-3">
                  <span className="text-gray-500">Chunks indexed:</span> {state?.caseChunksCount ?? 0}
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => handleTriggerChunkEmbed(fetchState)}
                    disabled={chunking || !state?.casesWithPlainText}
                    className={btnSecondary}
                  >
                    {chunking ? "Running…" : `Chunk + embed (${fetchState})`}
                  </button>
                  <button onClick={() => handleTriggerChunkEmbed(null)} disabled={chunking || !state?.casesWithPlainText} className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm">
                    Chunk + embed (all)
                  </button>
                  {chunkResult && (
                    <span className="text-sm text-green-400">
                      Done: {chunkResult.cases_processed} cases, {chunkResult.chunks_created} chunks
                    </span>
                  )}
                </div>
              </StepCard>

              <StepCard stepNum={4} title="Test RAG" status={state?.caseChunksCount ? "ready" : "pending"}>
                <p className="text-sm text-gray-400 mb-3">Query case_chunks and validate response quality.</p>
                <textarea
                  value={ragQuestion}
                  onChange={(e) => setRagQuestion(e.target.value)}
                  rows={2}
                  placeholder="e.g. How do Georgia courts address parental alienation?"
                  className={`${inputClass} mb-3`}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <select value={ragState} onChange={(e) => setRagState(e.target.value)} className={`${inputClass} w-auto max-w-[140px]`}>
                    <option value="GA">GA</option>
                    <option value="">All</option>
                  </select>
                  <button onClick={handleTestRAG} disabled={ragTesting || !state?.caseChunksCount} className={btnPrimary}>
                    {ragTesting ? "Running…" : "Test RAG"}
                  </button>
                </div>
                {ragResult && (
                  <div className="mt-4 space-y-3">
                    <div className="p-3 rounded bg-[#0a0a0a] border border-gray-700">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-green-400">Answer</span>
                        <button onClick={() => setShowRetrievedChunks(!showRetrievedChunks)} className="text-xs text-amber-500 hover:text-amber-400">
                          {showRetrievedChunks ? "Hide" : "Show"} chunks ({ragResult.retrieved_chunks?.length || 0})
                        </button>
                      </div>
                      <p className="text-sm text-gray-300 whitespace-pre-wrap">{ragResult.answer}</p>
                    </div>
                    {showRetrievedChunks && ragResult.retrieved_chunks?.length ? (
                      <div className="space-y-2">
                        {ragResult.retrieved_chunks.slice(0, 5).map((c: any, i: number) => (
                          <div key={i} className="p-2 rounded bg-[#0a0a0a] border border-gray-800 text-xs">
                            <span className="text-gray-400">{c.case_name} ({c.date_filed})</span> · sim {c.similarity?.toFixed(2)}
                            <p className="text-gray-500 mt-0.5 line-clamp-2">{c.chunk_preview}</p>
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
          <div className="space-y-6">
            <p className="text-sm text-gray-400">
              Extract judges from raw_cases → populate judges table → build judge_analysis_embeddings.
            </p>
            <div className="grid gap-4">
              <StepCard stepNum={1} title="Extract judges from raw_cases">
                <p className="text-sm text-gray-400">Parse judge names from CourtListener cases. Pipeline coming soon.</p>
                <p className="text-xs text-gray-500 mt-2">Tables: judges, case_participants</p>
              </StepCard>
              <StepCard stepNum={2} title="Enrich judge profiles">
                <p className="text-sm text-gray-400">Fetch appointment dates, court info, background. Coming soon.</p>
              </StepCard>
              <StepCard stepNum={3} title="Chunk + Embed (judge_analysis_embeddings)">
                <p className="text-sm text-gray-400">Build RAG for judicial tendencies. Coming soon.</p>
              </StepCard>
              <StepCard stepNum={4} title="Test Judge RAG">
                <p className="text-sm text-gray-400">Query by judge name + state. Coming soon.</p>
              </StepCard>
            </div>
          </div>
        )}

        {/* Expert RAG */}
        {activeTab === "expert" && (
          <div className="space-y-6">
            <p className="text-sm text-gray-400">
              GALs, psychologists, custody evaluators. Aggregate testimony, reports, credentials.
            </p>
            <div className="grid gap-4">
              <StepCard stepNum={1} title="Ingest expert data">
                <p className="text-sm text-gray-400">State licensing boards, court transcripts, JurisPro. Coming soon.</p>
              </StepCard>
              <StepCard stepNum={2} title="Build expert profiles (experts table)">
                <p className="text-sm text-gray-400">Store credentials, type, state, county. Coming soon.</p>
              </StepCard>
              <StepCard stepNum={3} title="Chunk + Embed (expert_profile_embeddings)">
                <p className="text-sm text-gray-400">RAG for expert persuasion patterns. Coming soon.</p>
              </StepCard>
              <StepCard stepNum={4} title="Test Expert RAG">
                <p className="text-sm text-gray-400">Query by expert name + role. Coming soon.</p>
              </StepCard>
            </div>
          </div>
        )}

        {/* Attorney RAG */}
        {activeTab === "attorney" && (
          <div className="space-y-6">
            <p className="text-sm text-gray-400">
              Opposing counsel + user&apos;s attorney. Motion patterns, success rates, strategy.
            </p>
            <div className="grid gap-4">
              <StepCard stepNum={1} title="Ingest attorney data">
                <p className="text-sm text-gray-400">PACER, state bar, case records. Coming soon.</p>
              </StepCard>
              <StepCard stepNum={2} title="Build attorney profiles (attorneys table)">
                <p className="text-sm text-gray-400">Bar #, practice areas, firm. Coming soon.</p>
              </StepCard>
              <StepCard stepNum={3} title="Chunk + Embed (attorney_intelligence_embeddings)">
                <p className="text-sm text-gray-400">RAG for briefs, motions, strategies. Coming soon.</p>
              </StepCard>
              <StepCard stepNum={4} title="Test Attorney RAG">
                <p className="text-sm text-gray-400">Query by attorney name. Coming soon.</p>
              </StepCard>
            </div>
          </div>
        )}

        {/* Filing RAG */}
        {activeTab === "filing" && (
          <div className="space-y-6">
            <p className="text-sm text-gray-400">
              User-uploaded opposing counsel filings. Real-time analysis, rebuttal suggestions.
            </p>
            <div className="grid gap-4">
              <StepCard stepNum={1} title="Upload filing">
                <p className="text-sm text-gray-400">User uploads PDF. Stored in evidence + filing_embeddings. Coming soon.</p>
              </StepCard>
              <StepCard stepNum={2} title="Parse + chunk">
                <p className="text-sm text-gray-400">Extract text, chunk by section. Coming soon.</p>
              </StepCard>
              <StepCard stepNum={3} title="Embed (filing_embeddings)">
                <p className="text-sm text-gray-400">Vector search for rebuttal context. Coming soon.</p>
              </StepCard>
              <StepCard stepNum={4} title="Analyze filing">
                <p className="text-sm text-gray-400">Cross-ref with case law, generate rebuttal memo. Coming soon.</p>
              </StepCard>
            </div>
          </div>
        )}

        {/* Tools */}
        {activeTab === "tools" && (
          <div className="space-y-6">
            <div className="rounded-lg border border-gray-800 bg-[#0d0d0d] p-4">
              <h2 className="font-medium text-amber-400 mb-3">User subscription</h2>
              <p className="text-sm text-gray-400 mb-4">
                Grant or revoke plan for a user by email.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[200px]">
                  <label className={labelClass}>User email</label>
                  <input
                    type="email"
                    value={subUserEmail}
                    onChange={(e) => setSubUserEmail(e.target.value)}
                    placeholder="user@example.com"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Action</label>
                  <select value={subAction} onChange={(e) => setSubAction(e.target.value as typeof subAction)} className={inputClass}>
                    <option value="grant_flat">Grant flat</option>
                    <option value="grant_monthly">Grant monthly</option>
                    <option value="revoke">Revoke</option>
                  </select>
                </div>
                <button onClick={handleSetSubscription} disabled={subLoading} className={btnPrimary}>
                  {subLoading ? "Applying…" : "Apply"}
                </button>
              </div>
              {subResult && <p className="mt-2 text-sm text-green-400">{subResult}</p>}
            </div>
          </div>
        )}
      </main>

      <footer className="max-w-5xl mx-auto px-4 py-6 text-sm text-gray-500 border-t border-gray-800 mt-8">
        <Link href="/" className="text-amber-500 hover:text-amber-400">← Back to home</Link>
      </footer>
    </div>
  )
}
