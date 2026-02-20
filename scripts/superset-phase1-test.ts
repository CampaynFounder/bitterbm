/**
 * Phase 1 superset test: write a test superset JSON file so you can run Phase 2 retrieval.
 *
 * Usage:
 *   npx tsx scripts/superset-phase1-test.ts
 *   npx tsx scripts/superset-phase1-test.ts 5
 *   npx tsx scripts/superset-phase1-test.ts --ids id1,id2,id3
 *
 * Output: scraper/superset/output/test-superset.json with { ids: [...] }
 * Then run retrieval: npx tsx scripts/run-scraper-headed.ts retrieval-flow.json --ids-file scraper/superset/output/test-superset.json
 * Or use Admin → Superset, upload that file, paste retrieval flow, Run retrieval (API).
 */
import { writeFileSync, mkdirSync, existsSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, "..")
const outDir = resolve(projectRoot, "scraper/superset/output")
const outPath = resolve(outDir, "test-superset.json")

function main() {
  const args = process.argv.slice(2)
  let ids: string[] = ["test-1", "test-2", "test-3"]

  const idsIdx = args.indexOf("--ids")
  if (idsIdx !== -1 && args[idsIdx + 1]) {
    ids = args[idsIdx + 1].split(",").map((s) => s.trim()).filter(Boolean)
  } else if (args.length >= 1 && !args[0].startsWith("-")) {
    const n = Math.min(Math.max(1, parseInt(args[0], 10)), 100)
    ids = Array.from({ length: n }, (_, i) => `test-${i + 1}`)
  }

  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true })
  }

  const payload = { ids, meta: { generatedBy: "superset-phase1-test", at: new Date().toISOString() } }
  writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8")
  console.log(`Wrote ${ids.length} ids to ${outPath}`)
  console.log("Next: run Phase 2 retrieval with this file (Superset admin page or headed script with --ids-file).")
}

main()
