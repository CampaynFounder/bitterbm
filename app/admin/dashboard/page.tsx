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
        const [rawRes, chunksRes, runsRes, sampleRes] = await Promise.all([
          supabase.from("raw_cases").select("cluster_id", { count: "exact", head: true }),
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
        const chunksCount = chunksRes.count ?? 0
        const sampleCases = (sampleRes.data ?? []) as RawCase[]

        const countyRes = await supabase
          .from("raw_cases")
          .select("county")
        const counties = Array.from(
          new Set(
            (countyRes.data ?? [])
              .map((r: { county: string | null }) => r.county)
              .filter(Boolean) as string[]
          )
        ).sort()

        setState({
          rawCasesCount: rawCount,
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

  async function handleTriggerFetch(maxResults: number = 20, fetchFullText = false) {
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
        body: JSON.stringify({ max_results: maxResults, fetch_full_text: fetchFullText }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || `HTTP ${res.status}`)
      }
      setTriggerResult(data)
      // Refresh status by reloading
      const [rawRes, runsRes, sampleRes, countyRes] = await Promise.all([
        supabase.from("raw_cases").select("cluster_id", { count: "exact", head: true }),
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
              Fetches GA cases with “alienation” from courts gact, gactapp. Validates
              filters and case metadata.
            </p>
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
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => handleTriggerFetch(20)}
                disabled={triggering}
                className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium"
              >
                {triggering ? "Running…" : "Trigger fetch (20)"}
              </button>
              <button
                onClick={() => handleTriggerFetch(50)}
                disabled={triggering}
                className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm"
              >
                {triggering ? "…" : "Fetch 50"}
              </button>
              <button
                onClick={() => handleTriggerFetch(20, true)}
                disabled={triggering}
                className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm"
                title="Fetches full opinion text for RAG (slower)"
              >
                {triggering ? "…" : "Fetch 20 + text (RAG)"}
              </button>
              {triggerResult && (
                <span className="text-sm text-green-400">
                  Done: {triggerResult.fetched} fetched, {triggerResult.supabase_stored} stored
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
                <span className="text-gray-500">CourtListener filter:</span>{" "}
                <code className="text-amber-200/80">q=alienation type=o court_gact=on court_gactapp=on</code>
              </p>
              <p>
                <span className="text-gray-500">Supabase query:</span>{" "}
                <code className="text-amber-200/80">SELECT county FROM raw_cases</code>
                <span className="text-gray-500"> (no WHERE)</span>
              </p>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              County defaults to &quot;Georgia&quot;: gact/gactapp are statewide courts (GA Supreme, GA Appeals). County is inferred from court name (e.g. &quot;Fulton County Superior Court&quot;); when missing we use &quot;Georgia&quot;.
            </p>
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-gray-500">Total raw cases:</span>{" "}
                {state?.rawCasesCount ?? 0}
              </p>
              {state && state.counties.length > 0 && (
                <p>
                  <span className="text-gray-500">Counties in DB:</span>{" "}
                  {state.counties.join(", ")}
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
