# oimo Self Evolution (project-local)

This directory holds the **Self Improvement Session** outputs for this project.
Product source is never modified here — briefs are for an external coding agent.

| Path | Purpose |
|------|---------|
| `INDEX.md` | Dashboard + open items |
| `history/HISTORY.md` | Append-only evolution runs |
| `backlog/BACKLOG.md` | Prioritized Self Improvement Backlog |
| `briefs/*.md` | AI-to-AI product modification instructions (9-section template) |
| `friction/*.md` | Friction / Human Attention Cost analyses |
| `reviews/*.md` | Session self-evaluations |
| `scenarios/*.json` | Project friction scenario fixtures (override/extend builtins) |
| `snapshots/*` | Rollback checkpoints of `.oimo/{skills,tools,hooks,workflows,tui}` |

Commands: `/evolve` · `/self-improve` · `/evolve-status`

Tool: `evolve_status` (metrics / dashboard / snapshot / rollback / scenarios / gate)

Workflows:
- `evolve-review` — multi-agent review of a brief
- `evolve-apply` — **requires `approved: true`**; worktree implement → verify → draft PR

Recommended loop:

```text
/evolve → brief
  → workflow evolve-review
  → human OK
  → workflow evolve-apply { brief, approved: true }
  → evolve_status gate (+ scenario_score)
  → human merges PR
```


Config (opt-out defaults):

```jsonc
{
  "evolve": {
    "auto": false,
    "interval_days": 14,
    "skills": { "enabled": true },
    "briefs": { "enabled": true },
    "friction": { "enabled": true },
    "backlog": { "enabled": true },
    "session_review": { "enabled": true }
  }
}
```

Workflow:

```
Use oimo on real work → /evolve → review briefs → hand to Cursor/other agent → verify → next cycle
```
