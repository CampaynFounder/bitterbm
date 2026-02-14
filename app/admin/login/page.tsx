"use client"

import { useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"

export default function AdminLoginPage() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${typeof window !== "undefined" ? window.location.origin : ""}/admin/auth/callback`,
        },
      })
      if (err) throw err
      setSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white">
        <div className="max-w-md w-full p-6 text-center">
          <h1 className="text-xl font-semibold mb-4">Check your email</h1>
          <p className="text-gray-400 mb-6">
            We sent a magic link to <strong>{email}</strong>. Click it to sign in.
          </p>
          <Link
            href="/admin/login"
            className="text-amber-500 hover:text-amber-400 underline"
          >
            Use a different email
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white">
      <div className="max-w-md w-full p-6">
        <h1 className="text-xl font-semibold mb-6">Admin sign in</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2 rounded bg-[#1a1a1a] border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
          />
          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium"
          >
            {loading ? "Sending…" : "Send magic link"}
          </button>
        </form>
        <p className="mt-6 text-sm text-gray-500">
          Pipeline status dashboard.
        </p>
      </div>
    </div>
  )
}
