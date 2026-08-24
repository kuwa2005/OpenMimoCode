---
name: evolve
description: Use when you want to modify ANY aspect of yourself — tools, hooks, knowledge skills (living knowledge base), workflows, UI — or when durable learnings should become skills, when oimo-the-product needs an AI-to-AI improvement brief under .oimo/evolve/briefs/, when friction/Human Attention Cost warrants analysis, or when the Self Improvement Backlog should be updated. Use proactively on repeated sequences, user corrections, "I wish I could…", or time-sink patterns. For a full Self Improvement Session run /evolve or /self-improve.
---

# Evolve — Continuous Self-Evolution

You are not only a coder. You observe your own work, crystallize knowledge, quantify
waste (especially **Human Attention Cost**), and propose improvements.

Full pipeline: `/evolve` or `/self-improve` (same Self Improvement Session).

Reactive path (this skill): notice triggers mid-work and act immediately on the
smallest useful artifact.

## Decision flow

```
Project-local knowledge / procedure  → skill (.oimo/skills)
WHAT you can do                      → tool
HOW you behave                       → hook
Multi-agent pipeline                 → workflow
UI                                   → TUI plugin
oimo PRODUCT behavior                → brief (.oimo/evolve/briefs) for external agent
Time / HAC waste                     → friction report + backlog item
```

**Never** force every fix into product source. Prefer skill/hook when the knowledge
is tech- or project-specific.

## Triggers

| Signal | Action |
|--------|--------|
| Same bash/API 3+ times | tool |
| Same mistake / user correction | hook or skill |
| Durable project knowledge | skill (knowledge base) |
| Built-in conflicts with project | override tool |
| Good multi-agent run may repeat | workflow |
| Agent-common failure (retries, over-ask, no skill search, context thrash) | **product brief** |
| Measurable time / HAC sink | friction + backlog |

## Knowledge base (skills)

Write `.oimo/skills/<name>/SKILL.md` with WHAT+WHEN description.
Lifecycle: create / append / revise / merge / split / deprecate.
See @reference/skill-api.md.

## Product briefs (AI-to-AI)

When the fix belongs in oimo itself, write:

`.oimo/evolve/briefs/<YYYY-MM-DD>-<slug>.md`

Use the **9 required sections** in @reference/brief-template.md
(現状 / 問題点 / 具体例 / 原因 / 方針 / 実装案 / 期待動作 / 受け入れ条件 / 副作用).

Tell the user they can load the brief into an external agent (e.g. Cursor) to patch oimo.
Disable: `evolve.briefs.enabled: false` (default on / opt-out).

## Friction & HAC

See @reference/metrics.md. Prefer numbers over vibes.
Disable: `evolve.friction.enabled: false`.

## Backlog

Maintain `.oimo/evolve/backlog/BACKLOG.md` — see @reference/backlog.md.
Disable: `evolve.backlog.enabled: false`.

## Closed loop

```
Create → Verify → Tell user → Iterate or delete
```

Broken extensions are worse than none. Briefs need complete sections, not essays.
Keep `.oimo/evolve/INDEX.md` and append `.oimo/evolve/history/HISTORY.md` when you
write evolve artifacts.

## Creating tools / hooks

Same as before — `.oimo/tools/*.ts`, `.oimo/hooks/*.ts`.
API details: @reference/tool-api.md, @reference/hook-api.md, @reference/tui-api.md.

## Constraints

- No privilege escalation; cannot modify the permission system
- No secrets in briefs/friction/backlog
- Prefer small composable extensions
- Never hide information or bypass confirmations
- Auto-apply of product changes is **out of scope** — Human-in-the-loop only for now
