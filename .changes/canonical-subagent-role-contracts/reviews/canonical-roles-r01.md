---
artifact: review-round
status: reviewed
tags: [review]
description: "Canonical role-body completeness review before projection work."
---
# canonical-roles Review Round 1

## Decision

`READY`

All eleven canonical role bodies are independently dispatchable at the semantic
contract level. No open role-body blocker remains before the separate client
projection phase.

## Scope And Method

- Reviewed every file under `agents/roles/` against the `subagent-judge` role
  rubric and the user-required dimensions: responsibility boundary, dispatch,
  inputs, source and evidence handling, method, stopping and failure behavior,
  and output handoff.
- Compared the eight enriched roles with same-purpose OpenCode prompts, while
  excluding product facts, local paths and commands, specialized language or
  backend policy, and client-native metadata.
- Kept `code-simplifier`, `planning-reviewer`, and `review-verifier` unchanged
  because their existing semantic contracts were already sufficient.
- D7 client-native format and projection fit was deliberately not scored. The
  role-body score therefore uses D1-D6 and D8 for a maximum of 105 points.

## Role Evaluation

| Role | Score | Dispatch | Authority | Inputs and evidence | Method | Stop behavior | Output | Decision |
|---|---:|---|---|---|---|---|---|---|
| `code-simplifier` | 101/105 | clear | bounded apply/read-only modes | complete Scope Packet | five rounds | explicit statuses | evidence-rich | READY |
| `code-worker` | 102/105 | bounded implementation | scoped edits only | complete context packet | semantic map through validation | explicit statuses | implementation handoff | READY |
| `council-synthesizer` | 102/105 | conflicting independent positions | read only, no vote | council packet and evidence quality | evidence-weighted synthesis | explicit escalation | decision-owner handoff | READY |
| `design-alternatives` | 103/105 | unsettled design choice | read only | requirements, criteria, repo evidence | orthogonality and comparison | no-fabrication exits | three-option decision packet | READY |
| `harness-orchestrator` | 96/105 | multi-phase coordination | owner decisions preserved | authoritative context order | route, gate, verify, handoff | shared gate vocabulary | phase and next-action packet | READY |
| `implementation-planner` | 102/105 | frozen design to slices | read only, plan only | freeze, source, deferrals, validation | traceable ordered slicing | design/context conflict exits | executable slice set | READY |
| `planning-reviewer` | 94/105 | planning readiness | read only | artifact and source anchors | mode-specific review | blocks guessing | risk-ordered gate | READY |
| `repo-mapper` | 102/105 | unclear ownership or flow | read only | target, revision, consumer | execution/data/ownership tracing | partial and ambiguous exits | evidence-labeled map | READY |
| `review-verifier` | 96/105 | deep coverage inventory/compare | read only and isolated | sealed packet contracts | deterministic two-mode flow | canonical failure taxonomy | coverage gate | READY |
| `reviewer` | 102/105 | implementation correctness | strictly read only | target, intent, rules, validation | behavior and risk review | explicit limitations | findings plus review gate | READY |
| `solution-designer` | 102/105 | selected direction to design | read only, design only | decision, requirements, repo evidence | boundary and contract design | direction/context exits | implementation-design handoff | READY |

## Findings

| ID | Severity | Resolution |
|---|---|---|
| CSR-001 | Medium | Resolved: `implementation-planner` and `solution-designer` now state that they are read-only packet producers and do not edit artifacts. |
| CSR-002 | Low | Resolved: `code-worker` now routes generated targets through their owning source and repository generation path. |

## Evidence

- Canonical sources: `agents/roles/*.md`.
- Dispatch-description synchronization: `harness.manifest.json` and the existing
  source/frontmatter equality test.
- Contract locks: `tests/test-subagents-hooks.js`.
- `npm test -- --subagents --manifest`: verified (exact) after review fixes.
- `npm test`: verified (exact), all repository tests passed.
- `node bin/harness.js manifest --json`: verified (exact), 11 agents and no
  manifest errors or warnings.
- `node bin/harness-change-validate.js --state-root . --change
  canonical-subagent-role-contracts`: verified (exact), zero errors and warnings.
- `git diff --check`: verified (exact).

## Residual Boundary

Client-native mode, permission, model, sandbox, tool metadata, runtime refresh,
and projection-fit review remain outside this round. This `READY` decision
applies only to canonical role semantics.
