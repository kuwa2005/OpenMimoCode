# Self Improvement Backlog

Maintain `.oimo/evolve/backlog/BACKLOG.md` as the durable improvement queue.
Do not implement every item — accumulate, prioritize, promote to briefs.

## Item schema

```markdown
## <ID> — <title>
- Discovered: <ISO-8601>
- Frequency: ...
- Problem: ...
- Evidence: ...
- Likely cause: ...
- Proposal: ...
- Route: skill | product | both
- Priority: P0|P1|P2|P3
- Est. effect: ...
- HAC: high|medium|low
- Status: Detected | Analyzing | Candidate | Approved | Instruction Generated | Implemented | Verified | Rejected | Archived
- Links: ...
```

## Priority

```
Improvement Score ≈ frequency × time_loss × impact × recurrence
```

Prefer small recurring wastes over rare long incidents.

## Route

- **skill** — project-local knowledge / `.oimo` extension
- **product** — oimo agent/system behavior → Track B brief
- **both** — skill now, product brief for systemic part
