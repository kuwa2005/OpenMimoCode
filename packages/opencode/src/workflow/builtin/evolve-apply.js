export const meta = {
  name: "evolve-apply",
  description:
    "Human-approved semi-automatic apply of an oimo evolve brief: implement in an isolated worktree, verify, and open a draft PR. Never applies without args.approved=true.",
  whenToUse:
    "Use after evolve-review recommends adopt/revise and the USER explicitly approved. Pass args.brief and args.approved=true. Optional args.branch, args.title. Does not merge. Dangerous scopes (permissions, auth, schema migrations) must stay out of scope unless the brief already marks them approved.",
  phases: [
    { title: "Guard", detail: "Require explicit args.approved=true; refuse otherwise" },
    { title: "Load brief", detail: "Read brief + INDEX; refuse high-risk scopes without explicit allow_dangerous" },
    { title: "Implement", detail: "Worktree-isolated agent implements acceptance criteria" },
    { title: "Verify", detail: "typecheck / targeted tests; run evolve_status gate if possible" },
    { title: "PR", detail: "Open a draft pull request for human merge" },
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
if (!brief) throw new Error("args.brief is required")

phase("Guard")
if (_a.approved !== true && _a.approved !== "true") {
  return {
    ok: false,
    needsApproval: true,
    brief,
    message: [
      "Human approval required before product-code apply.",
      "Re-run with: workflow({ operation:'run', name:'evolve-apply', args: { brief: '<path>', approved: true } })",
      "Recommended: run evolve-review first, then approve explicitly.",
    ].join("\n"),
  }
}

phase("Load brief")
const loaded = await agent(
  [
    "Read the evolve brief and .oimo/evolve/INDEX.md.",
    "Summarize: title, priority, acceptance criteria, suggested touch points, out of scope, risks.",
    "If the brief touches permission systems, auth/secrets, DB schema migrations, or external API contracts,",
    "set dangerous=true unless args.allow_dangerous is already true.",
    "Return JSON: { title, priority, acceptance: string[], touchpoints: string[], dangerous: boolean, summary: string }",
    "",
    `Brief: ${brief}`,
    `allow_dangerous=${_a.allow_dangerous === true || _a.allow_dangerous === "true"}`,
  ].join("\n"),
)

const dangerBlocked =
  typeof loaded === "string" &&
  /"dangerous"\s*:\s*true/.test(loaded) &&
  !(_a.allow_dangerous === true || _a.allow_dangerous === "true")

if (dangerBlocked) {
  return {
    ok: false,
    needsApproval: true,
    brief,
    message:
      "Brief marked dangerous (permissions/auth/schema/API). Re-run with allow_dangerous:true only after explicit human OK.",
    loaded,
  }
}

phase("Implement")
const branchHint = _a.branch ? `Use branch name hint: ${_a.branch}` : "Choose a short branch name evolve/<slug>."
const implemented = await agent(
  [
    "You are applying an oimo PRODUCT change from an evolve brief.",
    "Work only on acceptance criteria. Do not expand scope.",
    "Create commits on a feature branch. Prefer small, reviewable diffs.",
    "Do NOT push with --force. Do NOT merge to main.",
    branchHint,
    "",
    "Brief context:",
    loaded,
  ].join("\n"),
  { isolation: "worktree", label: "evolve-apply", phase: "Implement" },
)

phase("Verify")
const verified = await agent(
  [
    "Verify the evolve-apply changes.",
    "From packages/opencode run: bun typecheck",
    "Run the most relevant bun test files for touched areas.",
    "If evolve_status tool is available, call operation=gate.",
    "Return JSON: { typecheck: 'pass'|'fail', tests: 'pass'|'fail'|'skipped', gate: 'pass'|'fail'|'n/a', notes: string }",
    "",
    "Implementation summary:",
    implemented,
  ].join("\n"),
  { label: "evolve-verify", phase: "Verify" },
)

phase("PR")
const title = _a.title ? String(_a.title) : undefined
const pr = await agent(
  [
    "Open a DRAFT pull request for the evolve-apply branch (gh pr create --draft).",
    "PR body must include: Summary, Brief path, Acceptance criteria checklist, Test plan, Rollback notes.",
    title ? `Title: ${title}` : "Title: derive from brief title prefixed with 'evolve:'",
    "Do not merge. Return the PR URL.",
    "",
    "Verify result:",
    verified,
  ].join("\n"),
  { label: "evolve-pr", phase: "PR" },
)

return {
  ok: true,
  brief,
  loaded,
  verified,
  pr,
  note: "Draft PR only — human merge required. Use git revert / PR close to rollback product changes.",
}
