# Friction & Human Attention Cost

Quantify before proposing. Hard once ≠ waste; repeated thrash = waste.

## Core metrics

| Metric | Why |
|--------|-----|
| Tool call count | Churn / wrong tool |
| Same-file re-reads | Missing notes / skill |
| Edit churn on same region | Unstable approach |
| Build/test fail loops | Weak verify loop |
| User corrections | Misalignment |
| Clarification turns | Spec / hearing gap |
| Skill hits vs rediscovery | Knowledge base unused |
| **Human Attention Cost (HAC)** | User time spent caring for the agent |

## HAC drivers

- Confirmations the agent could skip after policy/skill
- Corrections of the same class
- Questions answerable from repo/tools
- Asking the user to do automatable work
- Dumping decisions the agent should make under autonomy

## Judgment

```
Same error × 20 in 30m  → backlog / brief
Hard novel bug × 30m once → may be fine
```
