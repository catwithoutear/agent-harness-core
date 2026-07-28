---
artifact: implementation-design-detail
status: draft
tags: [design, implementation]
description: "Detailed design problem, goals, non-goals, and boundaries."
---
# Problem, Goals, and Boundaries

## Goal

Make the Core workflow enforce this order for non-trivial design work:

```text
proposal -> reviewed solution design -> implementation-design assessment
         -> reviewed implementation design when required
         -> reviewed task slices -> implementation
```

Keep fast and compact paths for changes that do not need the full chain.

## Non-goals

- No workflow engine, mutable phase state, new public command, or identity
  authorization protocol.
- No semantic readiness inference from file or directory presence.
- No reopening of migration or V1/V2 bootstrap history.
- No review-verifier V2 or project-specific workflow change.
- No task slicing or source implementation as part of this pack.

## Boundary Conditions

- Existing legacy and structured workspaces remain usable; new checks are
  prospective.
- Existing writers and validators remain structural. Coordinators and reviewers
  own semantic readiness.
- A changed solution decision invalidates dependent pack and task evidence.
- README and README_CN semantic guidance remain synchronized.
- Canonical source assets are edited; projections are refreshed only through
  the repository projector.

## Source Artifacts

| Source | Anchor | Decision or fact | Used by |
|---|---|---|---|
| `design.md` | `## Detailed Design Index`, `## Paths Through The Workflow` | Defines artifact responsibilities and fast, compact, and design paths. | All modules |
| `design.md` | `## Review And Transition Rules` | Defines readable transition rules without a gate protocol. | Workflow coordination |
| `design.md` | `## Implementation-Design Trigger` | Trigger assessment follows a ready solution design. | Workflow guidance |
| `design.md` | `## Task-Slicing Gate` | Slices derive from the last required accepted artifact. | Planner and task writer |
| `research.md` | `## Confirmed Current-State Facts` | Current tools are structural and ordering is ambiguous. | Compatibility decisions |
| `reviews/solution-design-r03.md` | `## Decision` | Simplified solution-design review is `READY`. | Pack admission |
| `reviews/migration-r01.md` | `## Decision` | Migration committed and structured artifacts are permitted. | Workspace readiness |
| `decisions/DR-002-stage-gate-simplification.md` | `## Decision` | Removes mechanical gate references and trusts semantic reading/review. | Scope boundary |

## Rejected Alternatives

| Alternative | Why rejected | Tradeoff kept |
|---|---|---|
| Require every artifact for every change | Adds empty ceremony without reducing local risk. | Fast and compact paths remain explicit. |
| Treat pack presence as approval | Confuses structural creation with semantic readiness. | Writers stay simple and review evidence gates transitions. |
| Add phase state or command families | The need is ordering and evidence, not orchestration state. | Existing documents, reviews, validators, and commands are reused. |
| Put task decomposition in `design.md` | Mixes solution behavior with implementation sequencing. | The pack owns topology and reviewed slices own execution. |
