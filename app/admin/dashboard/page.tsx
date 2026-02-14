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
  sampleCases: RawCase[]
  counties: string[]
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [triggerResult, setTriggerResult] = useState<Record<string, number> | null>(null)
  const [state, setState] = useState<DashboardState | null>(null)
  const [fetchQuery, setFetchQuery] = useState("alienat*")
  const [fetchState, setFetchState] = useState("GA")
  const [fetchMax, setFetchMax] = useState(100)
  const [user, setUser] = useState<{ email?: string } | null>(null)

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
        const [rawRes, plainTextRes, chunksRes, runsRes, sampleRes] = await Promise.all([
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
          lastFetch: (runsRes.data as PipelineRun | null) ?? null,
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
      const [rawRes, plainTextRes, runsRes, sampleRes, countyRes] = await Promise.all([
        supabase.from("raw_cases").select("cluster_id", { count: "exact", head: true }),
        supabase.from("raw_cases").select("cluster_id", { count: "exact", head: true }).not("plain_text", "is", null),
        supabase.from("pipeline_runs").select("*").eq("step", "fetch").order("created_at", { ascending: false }).limit(1).maybeSingle(),
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
              lastFetch: (runsRes.data as PipelineRun | null) ?? prev.lastFetch,
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
              Fetch cases by state and search term(s). State maps to appellate courts (GA → gact/gactapp, NC → ncct/ncctapp, etc.).            </p>
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
              Use &quot;Fetch + text (RAG)&quot; to store—only cases with usable plain text (≥200 chars) and state/county are stored. Metadata-only fetch stores nothing.
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
                  {typeof triggerResult.supabase_skipped === "number" && triggerResult.supabase_skipped > 0 && (
                    <span className="text-amber-400">, {triggerResult.supabase_skipped} skipped (no usable text)</span>
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
                <code className="text-amber-200/80">q=(alienation) AND (court_id:gact OR court_id:gactapp)</code>
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
                  GA — {state.counties.length === 1 && state.counties[0] === "Georgia" ? "statewide courts (gact, gactapp)" : state.counties.join(", ")}
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
            <p className="text-sm">
              <span className="text-gray-500">Chunks indexed:</span>{" "}
              {state?.caseChunksCount ?? 0}
            </p>
            {state?.caseChunksCount === 0 && (
              <p className="text-gray-500 text-sm mt-2">
                Not yet. Run chunk + embed step after raw_cases are populated.
              </p>
            )}
          </section>

          {/* 4. User-context retrieval */}
          <section className="rounded-lg border border-gray-800 bg-[#111] p-4">
            <h2 className="font-medium text-amber-400 mb-3">4. User-context retrieval</h2>
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
