---
artifact: tasks-index
status: draft
tags: [implementation]
description: "Tasks index."
---
# Tasks

## Responsibility

This directory indexes tasks child documents.

## Execution Order

These slices are intentionally stacked, not parallel. Each slice should be
reviewed before starting the next slice unless the coordinator records an
explicit exception.

| Order | Slice | Depends On | Gate |
|---|---|---|---|
| 001 | Policy/schema execution-map registration | Design gate `READY` | Policy/schema/status/inventory tests pass. |
| 002 | Root resolution context | 001 | Root ambiguity tests pass and ambiguous writes leave files unchanged. |
| 003 | JS execution-map commands | 001, 002 | Command tests pass for absent-map JSON, planned rows, assignment idempotency, and no task/git mutation. |
| 004 | JS worktree validation | 001, 002, 003 | Validator fixture matrix passes for topology, evidence, path, duplicate-state, and dependency-status rules. |
| 005 | Python parity | 001-004 | Python behavior matches public JS fixtures. |
| 006 | Workflow assets | 001-005 | Skills, hooks, and workflow commands describe shipped behavior only. |
| 007 | Projection and final verification | 001-006 | Full repository verification and projection checks pass. |

## Child Index

| path | artifact | status | order | description |
|---|---|---|---|---|
| `slice-001-policy-schema-execution-map.md` | task-slice | reviewed | 001 | Slice 1: register execution-map artifact across policy, schema, status, and inventory. |
| `slice-002-root-resolution-context.md` | task-slice | reviewed | 002 | Slice 2: add shared root context resolution for state/code root selection. |
| `slice-003-js-execution-map-commands.md` | task-slice | reviewed | 003 | Slice 3: implement JS resolve, execution-map, and assign-slice commands. |
| `slice-004-js-worktree-validation.md` | task-slice | reviewed | 004 | Slice 4: add JS worktree validation for execution-map rows and evidence references. |
| `slice-005-python-parity.md` | task-slice | reviewed | 005 | Slice 5: mirror V1 public behavior in Python change tools. |
| `slice-006-workflow-assets.md` | task-slice | reviewed | 006 | Slice 6: update workflow prompts, hooks, and skills for worktree-aware state roots. |
| `slice-007-projection-final-verification.md` | task-slice | reviewed | 007 | Slice 7: run projection and final repository verification after source assets change. |
