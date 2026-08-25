# oimo Self Evolution (moved)

Self-evolution **logs** (briefs, friction, backlog, reviews, history, scenarios, snapshots)
now live under the user home:

```text
~/.oimo/evolve/<projectID>/
```

Project-local extensions stay in this tree:

```text
<worktree>/.oimo/{skills,tools,hooks,workflows,tui}/
```

Commands: `/evolve` · `/self-improve` · `/evolve-status`

Tool: `evolve_status` (metrics / dashboard / snapshot / rollback / scenarios / gate)

Workflows:
- `evolve-review` — multi-agent review of a brief
- `evolve-apply` — **requires `approved: true`**; worktree implement → verify → draft PR

Recommended loop:

```text
/evolve → brief under ~/.oimo/evolve/<projectID>/briefs/
  → workflow evolve-review
  → human OK
  → workflow evolve-apply { brief, approved: true }
  → evolve_status gate (+ scenario_score)
  → human merges PR
```
