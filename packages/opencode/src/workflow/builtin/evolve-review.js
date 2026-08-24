export const meta = {
  name: "evolve-review",
  description:
    "Multi-agent review of an oimo Self Evolution brief: parallel reviewers score a product-change brief, then a synthesizer produces adopt/reject guidance for Human-in-the-loop.",
  whenToUse:
    "Use after /evolve wrote a brief under .oimo/evolve/briefs/. Pass args.brief = path to the brief markdown (or its basename). Optional args.focus for emphasis. Does not auto-apply changes.",
  phases: [
    { title: "Load brief", detail: "Read the AI-to-AI brief and linked friction/backlog context" },
    { title: "Parallel review", detail: "Safety, usefulness, and feasibility reviewers run concurrently" },
    { title: "Synthesize", detail: "Merge reviews into adopt / revise / reject with rationale" },
  ],
}

const _a = (() => {
  if (args == null || args === undefined) return {}
  if (typeof args === "string") {
    try {
      const p = JSON.parse(args)
      return typeof p === "object" && p !== null ? p : { brief: args }
    } catch {
      return { brief: args }
    }
  }
  return typeof args === "object" ? args : {}
})()

const brief = String(_a.brief ?? "").trim()
if (!brief) throw new Error("args.brief is required — path or basename under .oimo/evolve/briefs/")

phase("Load brief")
const loaded = await agent(
  [
    "Locate and read the evolve brief referenced below.",
    "Also skim .oimo/evolve/INDEX.md and backlog if present.",
    "Return: full brief path, title, priority, problem summary, acceptance criteria list, and risks.",
    _a.focus ? `Focus: ${_a.focus}` : "",
    "",
    `Brief ref: ${brief}`,
  ]
    .filter(Boolean)
    .join("\n"),
)

phase("Parallel review")
const [safety, usefulness, feasibility] = await Promise.all([
  agent(
    [
      "You are Reviewer A (Safety / side-effects) for an oimo product-change brief.",
      "Score 1-5 safety, list breakage risks, permission/security concerns, rollback needs.",
      "Output JSON: { score, risks: string[], blockers: string[], recommendation: 'adopt'|'revise'|'reject' }",
      "",
      "Brief context:",
      loaded,
    ].join("\n"),
  ),
  agent(
    [
      "You are Reviewer B (Usefulness / HAC impact) for an oimo product-change brief.",
      "Score 1-5 expected reduction in Human Attention Cost and friction.",
      "Output JSON: { score, expectedGains: string[], doubts: string[], recommendation: 'adopt'|'revise'|'reject' }",
      "",
      "Brief context:",
      loaded,
    ].join("\n"),
  ),
  agent(
    [
      "You are Reviewer C (Feasibility) for an oimo product-change brief.",
      "Score 1-5 implementability given suggested touch points; note missing acceptance tests.",
      "Output JSON: { score, touchpoints: string[], missingTests: string[], recommendation: 'adopt'|'revise'|'reject' }",
      "",
      "Brief context:",
      loaded,
    ].join("\n"),
  ),
])

phase("Synthesize")
const synthesis = await agent(
  [
    "Synthesize three evolve-brief reviews into a final Human-in-the-loop decision.",
    "Do NOT implement. Produce markdown with: Verdict (adopt|revise|reject), Why, Required revisions,",
    "Suggested external-agent instructions delta, Evaluation gate checks.",
    "Remind the user to use evolve_status snapshot/rollback around any apply.",
    "",
    "Safety review:",
    safety,
    "",
    "Usefulness review:",
    usefulness,
    "",
    "Feasibility review:",
    feasibility,
  ].join("\n"),
)

return {
  ok: true,
  brief,
  synthesis,
  note: "Human approval required before any product change.",
}
