/** Friction Learning structured types — Character must not mutate these. */

export type FrictionMode = "se" | "fde"

export type FrictionType =
  | "instruction_gap"
  | "interpretation_gap"
  | "implementation_gap"
  | "verification_gap"
  | "context_gap"
  | "requirement_discovery"
  | "preference_discovery"
  | "rule_correction"

export type Responsibility =
  | "user_instruction"
  | "agent_interpretation"
  | "agent_implementation"
  | "agent_verification"
  | "missing_context"
  | "shared_ambiguity"
  | "user_correction"

export type RuleScope = "task" | "session" | "project" | "user" | "general"

export type RuleStatus = "candidate" | "observed" | "reinforced" | "trusted" | "disabled"

export type StructuredFriction = {
  timestamp: string
  modes: FrictionMode[]
  original_instruction?: string
  interpreted_requirement?: string
  implementation_summary?: string
  verification_summary?: string
  user_feedback: string
  friction_type: FrictionType
  responsibility: Responsibility
  detected_gap: string
  root_cause: string
  improved_instruction?: string
  candidate_rule: string
  scope: RuleScope
  confidence: number
  future_application: string
  /** Presentation only — never used as learning evidence. */
  character_mode: string
  se_notes?: string
  fde_notes?: string
  business_intent?: string
  instruction_suggestion?: string
  rule_id?: string
  disable_rule_ids?: string[]
}

export type LearnedRule = {
  id: string
  text: string
  source: "friction-learning"
  observations: number
  confidence: number
  scope: RuleScope
  status: RuleStatus
  modes: FrictionMode[]
  tags: string[]
  created_at: string
  updated_at: string
  last_friction_type?: FrictionType
}

export type FrictionEventRecord = StructuredFriction & {
  id: string
  project_id: string
  session_id: string
}
