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

export default function AdminDashboardPage() {
  const router = useRouter()
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

  // RAG testing
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
          supabase
            .from("pipeline_runs")
            .select("*")
            .eq("step", "fetch")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("pipeline_runs")
            .select("*")
            .eq("step", "chunk")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("raw_cases")
            .select("cluster_id, case_name, court, county, judge, date_filed")
            .order("date_filed", { ascending: false, nullsFirst: false })
            .limit(5),
        ])

        const rawCount = rawRes.count ?? 0
        const casesWithPlainText = plainTextRes.count ?? 0
        const chunksCount = chunksRes.count ?? 0
        const sampleCases = (sampleRes.data ?? []) as RawCase[]

        const countyRes = await supabase.from("raw_cases").select("county")
        const counties = Array.from(new Set((countyRes.data ?? []).map((r: { county: string | null }) => r.county).filter(Boolean) as string[])).sort()

        setState({
          rawCasesCount: rawCount,
          casesWithPlainText,
          caseChunksCount: chunksCount,
          lastFetch: (fetchRunRes.data as PipelineRun | null) ?? null,
          lastChunk: (chunkRunRes.data as PipelineRun | null) ?? null,
          sampleCases,
          counties,
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load status")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [user])

  async function handleTriggerFetch(params: {
    maxResults?: number
    fetchFullText?: boolean
    query?: string
    state?: string
  }) {
    const {
      maxResults,
      fetchFullText = false,
      query = "alienat*",
      state = "GA",
    } = params
    const max = maxResults ?? fetchMax
    const url = process.env.NEXT_PUBLIC_MODAL_TRIGGER_URL
    const secret = process.env.NEXT_PUBLIC_PIPELINE_TRIGGER_SECRET
    if (!url || !secret) {
      setError("Set NEXT_PUBLIC_MODAL_TRIGGER_URL and NEXT_PUBLIC_PIPELINE_TRIGGER_SECRET in Cloudflare env")
      return
    }
    setTriggering(true)
    setTriggerResult(null)
    setError(null)
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({
          max_results: Math.min(5000, Math.max(1, max)),
          fetch_full_text: fetchFullText,
          query: (query || "alienat*").trim() || "alienat*",
          state: (state || "GA").trim().toUpperCase() || "GA",
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || `HTTP ${res.status}`)
      }
      setTriggerResult(data)
      // Refresh status by reloading
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ state: stateFilter || null }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || `HTTP ${res.status}`)
      }
      setChunkResult(data)
      const [chunksRes, chunkRunRes] = await Promise.all([
        supabase.from("case_chunks").select("id", { count: "exact", head: true }),
        supabase.from("pipeline_runs").select("*").eq("step", "chunk").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ])
      setState((prev) =>
        prev
          ? {
              ...prev,
              caseChunksCount: chunksRes.count ?? 0,
              lastChunk: (chunkRunRes.data as PipelineRun | null) ?? prev.lastChunk,
            }
          : prev
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chunk embed trigger failed")
    } finally {
      setChunking(false)
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
        body: JSON.stringify({
          question: ragQuestion,
          state: ragState || null,
          top_k: 10,
          provider: "openai",
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
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

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-xl font-semibold">Admin · Pipeline Status</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{user.email}</span>
            <button
              onClick={handleSignOut}
              className="text-sm text-amber-500 hover:text-amber-400"
            >
              Sign out
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-6 p-4 rounded bg-red-900/30 text-red-300 border border-red-700">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* 1. CourtListener */}
          <section className="rounded-lg border border-gray-800 bg-[#111] p-4">
            <h2 className="font-medium text-amber-400 mb-3">1. CourtListener API</h2>
            <p className="text-sm text-gray-400 mb-3">
              Fetch cases by state and search term(s). State maps to appellate courts (GA → ga/gactapp, NC → ncct/ncctapp, etc.).            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label htmlFor="fetch-state" className="block text-xs text-gray-500 mb-1">State</label>
                <select
                  id="fetch-state"
                  value={fetchState}
                  onChange={(e) => setFetchState(e.target.value)}
                  className="w-full px-2 py-1.5 rounded bg-[#0a0a0a] border border-gray-700 text-sm text-white"
                >
                  <option value="GA">Georgia (GA)</option>
                  <option value="NC">North Carolina (NC)</option>
                  <option value="FL">Florida (FL)</option>
                  <option value="TX">Texas (TX)</option>
                </select>
              </div>
              <div>
                <label htmlFor="fetch-query" className="block text-xs text-gray-500 mb-1">Search term(s)</label>
                <input
                  id="fetch-query"
                  type="text"
                  value={fetchQuery}
                  onChange={(e) => setFetchQuery(e.target.value)}
                  placeholder="e.g. alienat* (alienation, alienated), or alienation custody"
                  className="w-full px-2 py-1.5 rounded bg-[#0a0a0a] border border-gray-700 text-sm text-white placeholder-gray-500"
                />
              </div>
              <div>
                <label htmlFor="fetch-max" className="block text-xs text-gray-500 mb-1">Max results (1–5000)</label>
                <input
                  id="fetch-max"
                  type="number"
                  min={1}
                  max={5000}
                  value={fetchMax}
                  onChange={(e) => setFetchMax(Math.min(5000, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                  className="w-full px-2 py-1.5 rounded bg-[#0a0a0a] border border-gray-700 text-sm text-white"
                />
              </div>
            </div>
            {state?.lastFetch ? (
              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-gray-500">Last run:</span>{" "}
                  {new Date(state.lastFetch.created_at).toLocaleString()}
                </p>
                {state.lastFetch.counts && (
                  <p>
                    <span className="text-gray-500">Fetched:</span>{" "}
                    {state.lastFetch.counts.fetched ?? "—"} | Supabase stored:{" "}
                    {state.lastFetch.counts.supabase_stored ?? "—"}
                  </p>
                )}
                {state.lastFetch.filters && (
                  <p>
                    <span className="text-gray-500">Filters:</span>{" "}
                    {JSON.stringify(state.lastFetch.filters)}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No fetch runs yet.</p>
            )}
            <p className="text-xs text-gray-500 mb-2">
              Use &quot;Fetch + text (RAG)&quot; to store. Cases with usable text (≥200 chars) or a PDF are stored; &quot;Fetch&quot; without text stores nothing.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                onClick={() => handleTriggerFetch({ query: fetchQuery, state: fetchState })}
                disabled={triggering}
                className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium"
              >
                {triggering ? "Running…" : `Fetch ${fetchMax}`}
              </button>
              <button
                onClick={() => handleTriggerFetch({ fetchFullText: true, query: fetchQuery, state: fetchState })}
                disabled={triggering}
                className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm"
                title="Fetches full opinion text for RAG (slower)"
              >
                {triggering ? "…" : `Fetch ${fetchMax} + text (RAG)`}
              </button>
              {triggerResult && (
                <span className="text-sm text-green-400">
                  Done: {triggerResult.fetched} fetched, {triggerResult.supabase_stored} stored
                  {typeof triggerResult.pdfs_stored === "number" && triggerResult.pdfs_stored > 0 && (
                    <span>, {triggerResult.pdfs_stored} PDFs</span>
                  )}
                  {typeof triggerResult.supabase_skipped === "number" && triggerResult.supabase_skipped > 0 && (
                    <span className="text-amber-400">, {triggerResult.supabase_skipped} skipped</span>
                  )}
                </span>
              )}
            </div>
          </section>

          {/* 2. Storage */}
          <section className="rounded-lg border border-gray-800 bg-[#111] p-4">
            <h2 className="font-medium text-amber-400 mb-3">2. Storage (raw_cases)</h2>
            <p className="text-sm text-gray-400 mb-3">
              JSON/text from CourtListener stored in Supabase raw_cases table.
            </p>
            <div className="space-y-2 text-sm font-mono text-gray-400 mb-3">
              <p>
                <span className="text-gray-500">Example:</span>{" "}
                <code className="text-amber-200/80">q=(alienation) AND (court_id:ga OR court_id:gactapp)</code>
              </p>
              <p>
                <span className="text-gray-500">Current filters:</span>{" "}
                state={fetchState}, query=&quot;{fetchQuery}&quot;
              </p>
            </div>
            <div className="space-y-2 text-sm mb-3">
              <p>
                <span className="text-gray-500">Total cases (metadata):</span>{" "}
                {state?.rawCasesCount ?? 0}
              </p>
              <p>
                <span className="text-gray-500">Cases with full text (RAG-ready):</span>{" "}
                <span className={state?.casesWithPlainText ? "text-emerald-400" : "text-amber-400"}>
                  {state?.casesWithPlainText ?? 0}
                </span>
                {state?.rawCasesCount ? ` / ${state.rawCasesCount}` : ""}
              </p>
              {state?.rawCasesCount && (state?.casesWithPlainText ?? 0) === 0 && (
                <p className="text-amber-400/90 text-xs">
                  Run &quot;Fetch 20 + text (RAG)&quot; to store full opinion text for RAG training.
                </p>
              )}
              {state && state.counties.length > 0 && (
                <p>
                  <span className="text-gray-500">State / counties:</span>{" "}
                  GA — {state.counties.length === 1 && state.counties[0] === "Georgia" ? "statewide courts (ga, gactapp)" : state.counties.join(", ")}
                </p>
              )}
              {state && state.sampleCases.length > 0 && (
                <div>
                  <p className="text-gray-500 mb-2">Sample cases:</p>
                  <ul className="space-y-1 text-gray-300">
                    {state.sampleCases.map((c) => (
                      <li key={c.cluster_id}>
                        {c.case_name ?? "—"} ({c.court ?? "—"}, {c.date_filed ?? "—"})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          {/* 3. RAG */}
          <section className="rounded-lg border border-gray-800 bg-[#111] p-4">
            <h2 className="font-medium text-amber-400 mb-3">3. RAG (case_chunks)</h2>
            <p className="text-sm text-gray-400 mb-3">
              Chunked, embedded, indexed for vector search. Ready for user queries.
            </p>
            <div className="space-y-2 text-sm mb-3">
              <p>
                <span className="text-gray-500">Chunks indexed:</span>{" "}
                {state?.caseChunksCount ?? 0}
              </p>
              {state?.lastChunk && (
                <p>
                  <span className="text-gray-500">Last chunk run:</span>{" "}
                  {new Date(state.lastChunk.created_at).toLocaleString()}
                  {state.lastChunk.counts && (
                    <span className="ml-2 text-gray-400">
                      ({state.lastChunk.counts.cases_processed} cases, {state.lastChunk.counts.chunks_created} chunks)
                    </span>
                  )}
                </p>
              )}
            </div>
            {state?.caseChunksCount === 0 && (
              <p className="text-gray-500 text-sm mb-2">
                Run chunk + embed after raw_cases are populated.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => handleTriggerChunkEmbed(fetchState)}
                disabled={chunking || (state?.casesWithPlainText ?? 0) === 0}
                className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm"
                title={state?.casesWithPlainText ? "Chunk and embed training_ready_cases" : "Need cases with plain text first"}
              >
                {chunking ? "Running…" : `Chunk + embed (${fetchState})`}
              </button>
              <button
                onClick={() => handleTriggerChunkEmbed(null)}
                disabled={chunking || (state?.casesWithPlainText ?? 0) === 0}
                className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm"
                title="Chunk and embed all states"
              >
                {chunking ? "…" : "Chunk + embed (all states)"}
              </button>
              {chunkResult && (
                <span className="text-sm text-green-400">
                  Done: {chunkResult.cases_processed} cases, {chunkResult.chunks_created} chunks
                  {Array.isArray(chunkResult.errors) && chunkResult.errors.length > 0 && (
                    <span className="text-amber-400">, {chunkResult.errors.length} errors</span>
                  )}
                </span>
              )}
            </div>
          </section>

          {/* 4. RAG Testing */}
          <section className="rounded-lg border border-gray-800 bg-[#111] p-4">
            <h2 className="font-medium text-amber-400 mb-3">4. RAG Testing</h2>
            <p className="text-sm text-gray-400 mb-3">
              Test retrieval + LLM answer to validate system prompt and response quality.
            </p>
            {state?.caseChunksCount === 0 && (
              <p className="text-amber-400 text-sm mb-3">
                Run chunk + embed before testing RAG.
              </p>
            )}
            <div className="space-y-3">
              <div>
                <label htmlFor="rag-question" className="block text-xs text-gray-500 mb-1">Question</label>
                <textarea
                  id="rag-question"
                  value={ragQuestion}
                  onChange={(e) => setRagQuestion(e.target.value)}
                  rows={2}
                  placeholder="e.g. How do Georgia courts address parental alienation?"
                  className="w-full px-2 py-1.5 rounded bg-[#0a0a0a] border border-gray-700 text-sm text-white placeholder-gray-500"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rag-state" className="block text-xs text-gray-500 mb-1">State filter</label>
                  <select
                    id="rag-state"
                    value={ragState}
                    onChange={(e) => setRagState(e.target.value)}
                    className="w-full px-2 py-1.5 rounded bg-[#0a0a0a] border border-gray-700 text-sm text-white"
                  >
                    <option value="GA">Georgia (GA)</option>
                    <option value="">All states</option>
                  </select>
                </div>
              </div>
              <button
                onClick={handleTestRAG}
                disabled={ragTesting || (state?.caseChunksCount ?? 0) === 0}
                className="px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm"
              >
                {ragTesting ? "Running…" : "Test RAG"}
              </button>
              {ragResult && (
                <div className="space-y-3 mt-4">
                  <div className="p-3 rounded bg-[#0a0a0a] border border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-green-400">Answer</h3>
                      <button
                        onClick={() => setShowRetrievedChunks(!showRetrievedChunks)}
                        className="text-xs text-amber-500 hover:text-amber-400"
                      >
                        {showRetrievedChunks ? "Hide" : "Show"} retrieved chunks ({ragResult.retrieved_chunks?.length || 0})
                      </button>
                    </div>
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">{ragResult.answer}</p>
                  </div>
                  {showRetrievedChunks && ragResult.retrieved_chunks && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-amber-400">Retrieved Chunks</h3>
                      {ragResult.retrieved_chunks.map((c: any, i: number) => (
                        <div key={i} className="p-2 rounded bg-[#0a0a0a] border border-gray-800 text-xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-gray-300">{c.case_name} ({c.date_filed})</span>
                            <span className="text-gray-500">sim: {c.similarity?.toFixed(2)}</span>
                          </div>
                          <p className="text-gray-400">{c.chunk_preview}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="p-3 rounded bg-[#0a0a0a] border border-gray-700">
                    <h3 className="text-sm font-medium text-amber-400 mb-2">Sources ({ragResult.sources?.length || 0} cases)</h3>
                    <ul className="space-y-1 text-xs text-gray-400">
                      {ragResult.sources?.map((s: any, i: number) => (
                        <li key={i}>{s.case_name} ({s.date_filed})</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* 5. User-context retrieval */}
          <section className="rounded-lg border border-gray-800 bg-[#111] p-4">
            <h2 className="font-medium text-amber-400 mb-3">5. User-context retrieval</h2>
            <p className="text-sm text-gray-400">
              Filter by user state, county, judge, alienation behaviors to surface
              cases where alienation was effectively proven. Will use RAG search +
              metadata filters once case_chunks are populated.
            </p>
          </section>
        </div>

        <footer className="mt-8 text-sm text-gray-500">
          <Link href="/" className="text-amber-500 hover:text-amber-400">
            ← Back to home
          </Link>
        </footer>
      </div>
    </div>
  )
}
