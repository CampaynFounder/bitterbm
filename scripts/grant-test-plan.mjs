#!/usr/bin/env node
/**
 * Grant yourself flat plan (unlimited access) for testing.
 * Usage: node scripts/grant-test-plan.mjs [BASE_URL]
 * Requires: ADMIN_SECRET in .env
 * Get your access token: Log in, then DevTools > Application > Local Storage, or:
 *   (await supabase.auth.getSession()).data.session?.access_token
 */
import { readFileSync } from "fs"
import { createInterface } from "readline"

const baseUrl = process.argv[2] || "http://localhost:3000"

// Load .env
try {
  const env = readFileSync(".env", "utf8")
  for (const line of env.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "")
  }
} catch {
  // ignore
}

const adminSecret = process.env.ADMIN_SECRET
if (!adminSecret) {
  console.error("Add ADMIN_SECRET=your_secret to .env")
  process.exit(1)
}

const rl = createInterface({ input: process.stdin, output: process.stdout })
const question = (q) => new Promise((r) => rl.question(q, r))

const token = await question("Paste your session access_token: ")
rl.close()

if (!token?.trim()) {
  console.error("Token required")
  process.exit(1)
}

const res = await fetch(`${baseUrl}/api/admin/grant-test-plan`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token.trim()}`,
    "X-Admin-Secret": adminSecret,
    "Content-Type": "application/json",
  },
})

const data = await res.json()
console.log(data)
process.exit(res.ok ? 0 : 1)
