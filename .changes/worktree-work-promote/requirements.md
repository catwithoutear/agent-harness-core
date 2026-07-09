---
artifact: requirements
status: draft
tags: [requirements, worktree-work-promote, state-root]
description: "Requirements for worktree-aware workflow execution."
---

# Requirements

## Accepted Requirements

- The harness workflow must distinguish the code root used for source edits from the canonical state root used for `.changes`, `.rules`, and other workflow artifacts.
- A linked worktree must not silently create a partial `.changes/<change>` workspace when the intended canonical state root already exists elsewhere.
- Multi-worktree work must expose an explicit slice-to-worktree assignment model that can be handed off, reviewed, and later validated.
- Durable evidence for a slice must be written to the canonical change workspace, not scattered across per-worktree local notes.
- A task slice must be able to declare branch, worktree, parent/base, dependencies, owner, status, validation evidence, and handoff evidence.
- The workflow must support both independent parallel slices and dependent stacked slices without treating content overlap as proof of ancestry.
- Validator behavior should fail for non-terminal execution rows when a linked worktree appears to contain an accidental duplicate `.changes/<same-change>` workspace; terminal historical rows may report the duplicate as a warning.

## Non-Goals For V1

- Do not support `branch-local-state` in the first implementation slice.
- Do not infer the active slice from dirty git status alone.
- Do not introduce a project-specific worktree layout or fixed branch naming convention in core.
- Do not make every task use multiple worktrees; the model applies only when multiple execution roots are explicitly assigned.
- Do not replace `stacked-branch-workflow`; integrate with it where branch dependencies exist.

## Resolved By Implementation Design

- Command shape: add read-only `resolve`, read-only `execution-map --json`, write command `assign-slice`, and validator flag `--worktrees`.
- Artifact choice: add top-level `execution-map.md` as the scheduling authority; task slices remain evidence and implementation-detail authority.
- Root precedence: explicit `--state-root`, compatible `--repo-root`, approved environment, then candidate gathering across cwd-under-`.changes`, current repo root, and linked worktrees before any non-explicit root is selected.
- Validator blocking checks: invalid map shape, missing slice, invalid topology, duplicate active worktree, non-terminal duplicate local `.changes/<same-change>`, missing evidence for gated statuses, and dependency cycles.

## Resolved By Follow-up Review

- Duplicate-root precedence: a linked worktree's accidental duplicate `.changes/<change>` blocks non-explicit root inference before the current worktree can be selected.
- Validator root CLI syntax: both JS and Python validators use the same canonical `--state-root` / legacy `--repo-root` / `--code-root` contract with conflict tests.
- Python parity: V1 public behavior requires full Python parity for policy, root flags, repo-local schema precedence, execution-map commands, status output, and worktree validation.
- Worktree path semantics: `--worktree` relative paths resolve against `--code-root` when provided, otherwise cwd; persisted values are normalized absolute local execution coordinates; duplicate checks compare real paths; missing, unreadable, and non-git paths have status-specific severities.
- `planned` status semantics: `assign-slice --status planned` is allowed for existing task slices and may omit branch/worktree; non-planned execution states require them.
- Stacked topology: `ready` requires dependencies to be `ready` or `merged`, and `merged` requires dependencies to be `merged`.
