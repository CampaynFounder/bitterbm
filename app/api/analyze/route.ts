// POST /api/analyze - Evidence analysis (mock until real pipeline)
// Accepts FormData with files; returns AnalysisResult
// No auth required for value_first flow

import { NextRequest, NextResponse } from "next/server"

// Mock result for MVP - replace with real OCR + RAG pipeline
function mockAnalyze(): {
  alienationScore: number
  custodyChangeLikelihood: number
  alienationTactics: string[]
  thingsToProve: { label: string; category?: string }[]
  summary: string
} {
  return {
    alienationScore: 72,
    custodyChangeLikelihood: 58,
    alienationTactics: [
      "Lack of cooperation / inability to co-parent",
      "Child expresses unjustified hostility toward other parent",
      "Documented interference with visitation",
    ],
    thingsToProve: [
      { label: "Lack of cooperation / inability to co-parent", category: "Behaviors" },
      { label: "Child expresses unjustified hatred toward other parent", category: "Behaviors" },
      { label: "Expert testimony (evaluator, therapist)", category: "Evidence types" },
      { label: "Guardian ad litem reports", category: "Evidence types" },
      { label: "Documented interference with visitation", category: "Behaviors" },
    ],
    summary:
      "Your evidence shows patterns consistent with parental alienation. Similar cases in Georgia have resulted in custody modifications when documented over time. Continuing to document refusals, blocked communication, and alienating statements will strengthen your case.",
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const files = formData.getAll("files") as File[]
    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 })
    }
    if (files.length > 2) {
      return NextResponse.json({ error: "Maximum 2 files allowed for free tier" }, { status: 400 })
    }
    // TODO: OCR, RAG, scoring pipeline
    const result = mockAnalyze()
    return NextResponse.json(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Analysis failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
