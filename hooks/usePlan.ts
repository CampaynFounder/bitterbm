"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

export type Plan = "free" | "monthly" | "flat"

export function usePlan() {
  const [session, setSession] = useState<{ user: { id: string } } | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s) {
        setSession(null)
        setPlan(null)
        setLoading(false)
        return
      }
      setSession({ user: s.user as { id: string } })
      supabase
        .from("subscriptions")
        .select("plan")
        .eq("user_id", s.user.id)
        .maybeSingle()
        .then(
          ({ data }) => {
            const p = (data as { plan?: string } | null)?.plan ?? "free"
            setPlan(p as Plan)
            setLoading(false)
          },
          () => {
            setPlan("free")
            setLoading(false)
          }
        )
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      supabase.auth.getSession().then(({ data: { session: s } }) => {
        if (!s) {
          setSession(null)
          setPlan(null)
          return
        }
        setSession({ user: s.user as { id: string } })
        supabase
          .from("subscriptions")
          .select("plan")
          .eq("user_id", s.user.id)
          .maybeSingle()
          .then(
            ({ data }) => {
              const p = (data as { plan?: string } | null)?.plan ?? "free"
              setPlan(p as Plan)
            },
            () => setPlan("free")
          )
      })
    })
    return () => subscription.unsubscribe()
  }, [])

  const isFlat = plan === "flat"
  const isMonthly = plan === "monthly"
  const isEnrolled = isFlat || isMonthly

  return { session, plan, loading, isFlat, isMonthly, isEnrolled }
}
