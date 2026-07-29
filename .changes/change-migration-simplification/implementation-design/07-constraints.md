---
artifact: implementation-design-detail
status: draft
tags: [design, implementation]
description: "Design constraints, anti-pattern checks, and readiness self-review."
---
# Constraints and Self Check

## N/A Usage

Before readiness or freeze, every row below needs either evidence or
`N/A - <reason>`. Do not leave empty result cells in a frozen design.

## Constraints

| Constraint | Applies to | Enforcement or review check |
|---|---|---|
| Preserve exact legacy bytes | archive writes | byte-equality tests |
| Never overwrite conflicts | generated and archive paths | conflict tests |
| Source removal happens last | apply order | source-retention failure test |
| No transaction/bootstrap authority | commands and validators | source search and tests |
| Node/Python parity | both mirrors | shared fixture assertions |
| No changes to worktree state-root behavior | root resolution | existing full tests |
| Single-writer boundary is explicit | migration callers | design and user guidance review |
| Post-migration edits survive repeat apply | command behavior | mutate-then-repeat fixture |
| Old protocol leaves no dead implementation | source, docs, and tests | scoped `rg` zero-result check |

## Self Check

| Check | Result | Evidence | Follow-up |
|---|---|---|---|
| Requirement/source fact to implementation-step trace is complete | ready | `06-implementation-plan.md` | review |
| Stable source anchors are present or explicitly not applicable | ready | `02-code-topology.md` | review |
| Verification cells distinguish plan from executed evidence | ready | all evidence is marked planned | update after execution |
| Document integrity was checked with available mechanical signals | planned | change validator | run before implementation |
| No circular dependency | ready | module topology | review |
| No catch-all class without a bounded responsibility | N/A | no classes introduced | none |
| Subsystem and module boundaries are distinct when needed | ready | `02-code-topology.md` | review |
| Every core class maps to a file and test seam | N/A | no classes introduced | none |
| Failure path and rollback path are documented | ready | `04-runtime-flow.md`, `05-error-model.md` | review |
| Implementation steps can be compiled or verified incrementally | ready | `06-implementation-plan.md` | focused tests after each step |
