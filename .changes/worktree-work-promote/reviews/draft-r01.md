---
artifact: review-round
status: reviewed
tags: [review, worktree-work-promote]
description: "Workflow review of the multi-worktree execution draft."
---
# draft Review Round 1

## Decision

`NOT_READY`

The brainstormed direction is accepted, but it is not ready for implementation planning. The next checkpoint is an implementation-design pass that fixes the ownership, root-resolution, state-machine, topology, and validation contracts before code changes.

## Findings

| ID | Severity | Resolution |
|---|---|---|
| WWP-R01-F01 | Blocking | State ownership is not formal enough. `execution-map` and task slices must not both own branch, worktree, and status without drift rules. |
| WWP-R01-F02 | Blocking | Root resolution lacks deterministic precedence and fail-fast behavior for linked worktree writes. |
| WWP-R01-F03 | Blocking | Slice statuses are named but legal transitions and required evidence for `ready`, `merged`, and `blocked` are missing. |
| WWP-R01-F04 | Blocking | Parallel sibling slices and stacked branch dependencies are not yet represented as distinct topology modes. |
| WWP-R01-F05 | Should Fix | V1 should narrow to `shared-state`; `branch-local-state` should remain deferred until separately designed. |

## Evidence

- Reviewed target: `design.md`.
- Source discussion: user-reported linked worktree failure mode and brainstormed multi-worktree execution-map draft.
- Relevant existing contracts:
  - `workflow-control`: requires active change coordination, bounded slices, review, verification, and owning-artifact handoff.
  - `change-planner`: slices must be behavior/verification bounded and preserve dependency ordering.
  - `stacked-branch-workflow`: branch dependency, review, test, rollback, and independent-validity boundaries already exist and should be reused for stacked topology.

## Required Next Action

- Create or fill the implementation-design pack for V1 before implementation.
- Keep V1 scoped to `shared-state`.
- Define execution-map ownership, task-slice evidence ownership, root resolution, state transitions, topology representation, command shape, and validator behavior.
