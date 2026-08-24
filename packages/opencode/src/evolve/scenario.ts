export type ScenarioBudget = {
  maxUserClarifications?: number
  maxToolCalls?: number
  maxSameFileReads?: number
  maxCorrections?: number
  mustUseSkill?: string[]
  mustNotAskUserFor?: string[]
}

export type ScenarioFixture = {
  id: string
  title: string
  pattern:
    | "excess_clarification"
    | "same_file_reread"
    | "repeated_correction"
    | "skill_rediscovery"
    | "tool_churn"
  description: string
  /** Scripted user turns the agent should handle without thrash. */
  turns: string[]
  budget: ScenarioBudget
  /** One-line expected behavior for humans / external agents. */
  expect: string
}

export type ScenarioObservation = {
  userClarifications: number
  toolCalls: number
  sameFileReads: number
  corrections: number
  skillsUsed: string[]
  askedUserFor: string[]
}

export type ScenarioScore = {
  id: string
  pass: boolean
  failures: string[]
  observation: ScenarioObservation
  budget: ScenarioBudget
}

export function scoreScenario(fixture: ScenarioFixture, obs: ScenarioObservation): ScenarioScore {
  const failures: string[] = []
  const b = fixture.budget

  if (b.maxUserClarifications != null && obs.userClarifications > b.maxUserClarifications) {
    failures.push(`clarifications ${obs.userClarifications} > max ${b.maxUserClarifications}`)
  }
  if (b.maxToolCalls != null && obs.toolCalls > b.maxToolCalls) {
    failures.push(`toolCalls ${obs.toolCalls} > max ${b.maxToolCalls}`)
  }
  if (b.maxSameFileReads != null && obs.sameFileReads > b.maxSameFileReads) {
    failures.push(`sameFileReads ${obs.sameFileReads} > max ${b.maxSameFileReads}`)
  }
  if (b.maxCorrections != null && obs.corrections > b.maxCorrections) {
    failures.push(`corrections ${obs.corrections} > max ${b.maxCorrections}`)
  }
  for (const skill of b.mustUseSkill ?? []) {
    if (!obs.skillsUsed.includes(skill)) failures.push(`missing skill use: ${skill}`)
  }
  for (const ask of b.mustNotAskUserFor ?? []) {
    if (obs.askedUserFor.some((a) => a.toLowerCase().includes(ask.toLowerCase()))) {
      failures.push(`asked user for automatable: ${ask}`)
    }
  }

  return {
    id: fixture.id,
    pass: failures.length === 0,
    failures,
    observation: obs,
    budget: b,
  }
}

export function formatScenarioScore(s: ScenarioScore): string {
  const head = s.pass ? `PASS ${s.id}` : `FAIL ${s.id}`
  const lines = [
    `# ${head}`,
    "",
    `clarifications=${s.observation.userClarifications} toolCalls=${s.observation.toolCalls} sameFileReads=${s.observation.sameFileReads} corrections=${s.observation.corrections}`,
    `skills=[${s.observation.skillsUsed.join(", ")}]`,
  ]
  if (s.failures.length) {
    lines.push("", "## Failures", ...s.failures.map((f) => `- ${f}`))
  }
  return lines.join("\n")
}
