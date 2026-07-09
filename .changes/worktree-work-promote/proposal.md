---
artifact: proposal
status: draft
tags: [proposal, workflow, worktree-work-promote, execution-map, state-root]
description: "Proposal for worktree-aware task execution in the harness workflow."
---

# Proposal

## Why

The current workflow works well when the repository root, source checkout, and `.changes` state root are the same directory. Linked worktree development breaks that assumption. An agent may create a partial `.changes` workspace inside the worktree, discover missing runtime/projected files, and then search back in the main checkout. That creates duplicate state, ambiguous validation, and weak handoff evidence.

Large tasks can also be split across several worktrees, but current assets only describe task slices, handoffs, and stacked branches separately. They do not define how one change workspace coordinates multiple branches and worktrees.

## What Changes

Adopt a `shared-state` execution model for multi-worktree work:

- a single canonical `.changes/<change>` workspace owns durable state;
- each linked worktree is only an execution root for a bounded task slice;
- a future execution map records slice, status, branch, worktree, parent/base, dependencies, owner, and last evidence;
- individual task-slice artifacts keep slice-local plan, validation, review, rollback, and handoff evidence;
- workflow prompts and guards must resolve `code_root`, `state_root`, and `active_change` before writing `.changes` artifacts;
- validators should detect obvious accidental duplicate worktree-local `.changes` state.

## Impact

- Positive: prevents linked worktrees from becoming untracked parallel process roots.
- Positive: gives coordinators and handoff agents one place to inspect multi-worktree execution state.
- Positive: creates a clean bridge between `change-planner` task slices and `stacked-branch-workflow` branch topology.
- Positive: makes future tool support possible without relying on agent memory.
- Risk: duplicating branch/worktree/status fields across the execution map and task slices can create drift unless ownership is specified.
- Risk: supporting both `shared-state` and `branch-local-state` in one slice would broaden the design too much.
- Risk: root resolution can become surprising if precedence and fail-fast behavior are not specified before implementation.

## Validation

- Validate this change workspace with `node bin/harness-change-validate.js --repo-root . --change worktree-work-promote`.
- Before implementation, require an implementation-design pack that specifies root resolution, artifact ownership, state transitions, topology modes, command shape, and validator checks.
- During implementation, add regression coverage for linked-worktree duplicate-state detection and execution-map consistency once those features are introduced.

## Rollback

Remove the new workflow documentation, command behavior, validator checks, and tests introduced by the eventual implementation. Since V1 should only support `shared-state`, rollback should not need to migrate branch-local `.changes` workspaces.
