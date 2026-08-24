import type { ScenarioFixture } from "../scenario"

/** Built-in friction scenarios — small, repeatable regressions (not full trajectory replay). */
export const BUILTIN_SCENARIOS: ScenarioFixture[] = [
  {
    id: "excess-clarification-basic",
    title: "Do not over-ask when the task is already actionable",
    pattern: "excess_clarification",
    description:
      "User gave a concrete bugfix with file + symptom. Agent should investigate with tools, not interview the user.",
    turns: [
      "packages/opencode/src/session/retry.ts で同じエラーが3回リトライされても止まらない。指数バックオフを入れてテストも更新して。",
    ],
    budget: {
      maxUserClarifications: 1,
      maxToolCalls: 40,
      mustNotAskUserFor: ["which file", "どのファイル", "should I proceed", "進めてよい"],
    },
    expect: "At most one clarifying question; prefer reading the file and adding tests.",
  },
  {
    id: "same-file-reread",
    title: "Avoid rereading the same file many times",
    pattern: "same_file_reread",
    description: "After reading a file once, reuse context instead of re-reading the same path repeatedly.",
    turns: [
      "README.md の evolve の説明を短くして、同じ内容を AGENTS.md にも反映して。",
    ],
    budget: {
      maxSameFileReads: 3,
      maxToolCalls: 25,
    },
    expect: "Each touched file is read a small number of times; edits follow from retained context.",
  },
  {
    id: "repeated-correction",
    title: "Do not repeat a corrected mistake",
    pattern: "repeated_correction",
    description: "After the user corrects a convention, the next edit must follow it.",
    turns: [
      "新しいユーティリティを packages/opencode/src/util/foo.ts に追加して。",
      "違う、このリポジトリでは export * as Foo from \"./foo\" の自己エクスポートパターンにして。",
      "テストも同じパターンで追加して。",
    ],
    budget: {
      maxCorrections: 1,
      maxUserClarifications: 1,
    },
    expect: "After the correction turn, subsequent files use the self-export pattern without re-asking.",
  },
  {
    id: "skill-rediscovery",
    title: "Use an existing skill instead of rediscovering",
    pattern: "skill_rediscovery",
    description: "When a project skill covers the task, load it instead of exploring from zero.",
    turns: [
      "このプロジェクトの自己進化のやり方に従って、最近の摩擦を brief にして。",
    ],
    budget: {
      mustUseSkill: ["evolve"],
      maxToolCalls: 50,
      maxUserClarifications: 1,
    },
    expect: "Agent loads the evolve skill (or /evolve) rather than inventing a parallel process.",
  },
  {
    id: "tool-churn-search",
    title: "Bound exploratory search",
    pattern: "tool_churn",
    description: "Broad 'find where X is' should not explode into endless glob/grep thrash.",
    turns: ["shouldAutoEvolve が定義されている場所を見つけて、条件トリガーの閾値を教えて。"],
    budget: {
      maxToolCalls: 20,
      maxUserClarifications: 0,
    },
    expect: "A few Grep/Glob hits then an answer; no dozens of overlapping searches.",
  },
]
