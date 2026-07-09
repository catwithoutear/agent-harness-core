---
artifact: design
status: reviewed
tags: [design, review, worktree-work-promote, execution-map, state-root]
description: "Reviewed draft design for multi-worktree workflow execution."
---

# Design

## Detailed Design Index

| Area | Current Decision | Readiness |
|---|---|---|
| State model | Use one canonical `.changes/<change>` state root and treat worktrees as execution roots. | Accepted direction |
| Artifact ownership | Execution map should own assignment/status; task slices should own slice-local plan and evidence. | Needs formal contract |
| Root resolution | Must resolve `code_root`, `state_root`, `active_change`, and linked-worktree state before writes. | Blocking gap |
| Slice state machine | Draft statuses are `planned`, `claimed`, `active`, `ready`, `merged`, and `blocked`. | Needs transition rules |
| Topology modes | Support both independent parallel slices and stacked dependent slices. | Needs explicit representation |
| Tooling | Candidate commands: `execution-map`, `assign-slice`, and `--worktrees` validation. | Needs command design |

## Reviewed Draft

The brainstormed model is centralized state with distributed execution:

```text
canonical state root:
  /repo-main/.changes/<change>

execution roots:
  slice-001 -> branch=<branch-a> worktree=<path-a>
  slice-002 -> branch=<branch-b> worktree=<path-b>
```

The draft proposes an execution map with fields for slice, status, branch, worktree, base or parent, dependency list, owner, and last evidence. Each worktree performs code edits and local validation, but durable state must be written back to the canonical change workspace.

## Workflow Review Result

Gate: `NOT_READY` for implementation planning.

The direction is sound, but the draft is not yet specific enough for a bounded implementation slice. Blocking gaps from the workflow review:

- State ownership is not formal enough. `execution-map.md` and `tasks/slice-*.md` must not both own branch, worktree, and status without drift rules.
- Root resolution needs a deterministic precedence order and explicit fail-fast conditions.
- The slice state machine needs transition rules and required evidence for `ready`, `merged`, and `blocked`.
- Parallel sibling slices and stacked branch dependencies must be represented separately.
- Tool scope should be narrowed to `shared-state` V1; `branch-local-state` should remain deferred.

## Proposed V1 Contract

V1 should support only `shared-state`.

Authority split:

| Surface | Owns | Does Not Own |
|---|---|---|
| `execution-map` | slice assignment, current execution status, branch/worktree binding, dependency topology, owner, last evidence pointer | detailed implementation steps |
| task slice | objective, scope, implementation steps, validation evidence, review packet, rollback, handoff summary | global scheduling truth for other slices |
| git branch/worktree | code diff and local command execution | durable workflow state |

Root resolution must complete before any `.changes` write. The design should define at least:

- explicit `--state-root` or equivalent wins over inference;
- explicit environment/config selected by the user or coordinator is next;
- cwd inside `.changes/<change>` can select the state root and active change;
- linked-worktree metadata can identify candidate source roots but must not silently select a state root when multiple candidates exist;
- absence or conflict produces unresolved state and blocks regulated writes.

## Implementation-Design Requirements

Before coding, create the implementation-design pack and answer:

- Which files and commands own root resolution?
- What schema or Markdown contract represents the execution map?
- Which fields are authoritative in the map versus in task slices?
- What are legal slice status transitions?
- What evidence is required for `ready`, `merged`, and `blocked`?
- How does validation distinguish parallel sibling slices from stacked branch layers?
- What is the smallest V1 command surface?
- What warnings or errors should protect existing linked worktree users during transition?
