/** POST /api/analyze - Evidence analysis (mock) */
export async function onRequestPost(context: { request: Request }): Promise<Response> {
  try {
    const formData = await context.request.formData()
    const files = formData.getAll("files") as Blob[]
    if (!files || files.length === 0) return json({ error: "No files provided" }, 400)
    if (files.length > 2) return json({ error: "Maximum 2 files allowed for free tier" }, 400)
    const result = {
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
    return json(result)
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Analysis failed" }, 500)
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })
}
