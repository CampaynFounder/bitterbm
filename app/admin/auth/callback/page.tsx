"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function AdminAuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace("/admin/dashboard")
      } else {
        router.replace("/admin/login")
      }
    })
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white">
      <p className="text-gray-400">Signing you in…</p>
    </div>
  )
}
