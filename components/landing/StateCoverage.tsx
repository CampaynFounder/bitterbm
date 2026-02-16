"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { US_STATES } from "@/lib/constants"

const inputStyle = {
  width: "100%",
  padding: "var(--space-md)",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  color: "var(--text-primary)",
  fontSize: "1rem",
}

export function StateCoverage() {
  const [supportedStates, setSupportedStates] = useState<string[]>([])
  const [requestCounts, setRequestCounts] = useState<Record<string, number>>({})
  const [selectedState, setSelectedState] = useState("")
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [requested, setRequested] = useState(false)
  const [myRequests, setMyRequests] = useState<Set<string>>(new Set())
  const [session, setSession] = useState<{ user: { id: string; email?: string } } | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) return
    supabase.from("state_requests").select("state_code").eq("user_id", session.user.id).then(({ data }) => {
      setMyRequests(new Set((data ?? []).map((r: { state_code: string }) => r.state_code)))
    })
  }, [session?.user?.id])

  useEffect(() => {
    Promise.all([
      supabase.rpc("get_supported_states").then(({ data }) => setSupportedStates((data ?? []) as string[])),
      supabase.rpc("get_state_request_counts").then(({ data }) => {
        const map: Record<string, number> = {}
        ;(data ?? []).forEach((r: { state_code: string; request_count: number }) => {
          map[r.state_code] = Number(r.request_count)
        })
        setRequestCounts(map)
      }),
    ]).finally(() => setLoading(false))
  }, [])

  const isSupported = selectedState ? supportedStates.includes(selectedState) : false
  const requestCount = selectedState ? (requestCounts[selectedState] ?? 0) : 0
  const alreadyRequested = selectedState ? myRequests.has(selectedState) || requested : false

  async function handleRequest() {
    if (!selectedState || !session?.user) return
    setRequesting(true)
    setRequested(false)
    const { error } = await supabase.from("state_requests").upsert(
      { user_id: session.user.id, state_code: selectedState, email: session.user.email ?? null },
      { onConflict: "user_id,state_code" }
    )
    setRequesting(false)
    if (!error) {
      setRequested(true)
      setMyRequests((prev) => new Set(Array.from(prev).concat(selectedState)))
      supabase.rpc("get_state_request_counts").then(({ data }) => {
        const map: Record<string, number> = {}
        ;(data ?? []).forEach((r: { state_code: string; request_count: number }) => {
          map[r.state_code] = Number(r.request_count)
        })
        setRequestCounts(map)
      })
    }
  }

  if (loading) {
    return (
      <div style={{ padding: "var(--space-xl)", textAlign: "center", color: "var(--text-muted)" }}>
        Checking state coverage…
      </div>
    )
  }

  return (
    <section
      className="section"
      aria-labelledby="state-coverage-heading"
      style={{ paddingTop: "var(--space-xl)", paddingBottom: "var(--space-xl)" }}
    >
      <div className="container" style={{ maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
        <h2 id="state-coverage-heading" style={{ fontSize: "1.25rem", marginBottom: "var(--space-sm)", color: "var(--text-primary)" }}>
          Is your state covered?
        </h2>
        <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", marginBottom: "var(--space-lg)", lineHeight: 1.5 }}>
          We analyze case law by state. Check if yours is supported or request it.
        </p>
        <div style={{ marginBottom: "var(--space-md)" }}>
          <select
            id="state-coverage-select"
            aria-label="Select your state"
            value={selectedState}
            onChange={(e) => {
              setSelectedState(e.target.value)
              setRequested(false)
            }}
            style={{ ...inputStyle, cursor: "pointer", maxWidth: 320, margin: "0 auto" }}
          >
            <option value="">Select your state</option>
            {US_STATES.filter((s) => s.value).map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        {selectedState && (
          <div
            style={{
              padding: "var(--space-lg)",
              background: "var(--bg-card)",
              borderRadius: "12px",
              border: "1px solid var(--border)",
              textAlign: "center",
            }}
          >
            {isSupported ? (
              <p style={{ fontSize: "1rem", color: "var(--accent-cyan)", margin: 0, fontWeight: 600 }}>
                ✓ {US_STATES.find((s) => s.value === selectedState)?.label ?? selectedState} is supported
              </p>
            ) : (
              <>
                <p style={{ fontSize: "1rem", color: "var(--accent-gold)", margin: "0 0 var(--space-md)", fontWeight: 600 }}>
                  Not yet supported
                </p>
                {requestCount > 0 && (
                  <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "var(--space-md)" }}>
                    {requestCount} {requestCount === 1 ? "person has" : "people have"} requested this state
                  </p>
                )}
                {session?.user ? (
                  alreadyRequested ? (
                    <p style={{ fontSize: "0.9375rem", color: "var(--accent-cyan)", margin: 0 }}>
                      ✓ Request recorded. We prioritize by demand.
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRequest}
                      disabled={requesting}
                      className="btn-primary"
                      style={{ fontSize: "0.9375rem", padding: "var(--space-sm) var(--space-lg)" }}
                    >
                      {requesting ? "Requesting…" : "Request my state"}
                    </button>
                  )
                ) : (
                  <Link
                    href="/signin?redirect=/"
                    style={{ fontSize: "0.9375rem", color: "var(--accent-muted)", textDecoration: "underline" }}
                  >
                    Sign in to request
                  </Link>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
