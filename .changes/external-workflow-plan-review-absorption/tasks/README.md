---
artifact: tasks-index
status: reviewed
tags: [implementation]
description: "Tasks index."
---
# Tasks

## Responsibility

This directory indexes tasks child documents.

## Execution Order

Slices 001-004 are implemented and reviewed. First-wave Tracks A-D are
converged with `READY_WITH_NOTES` gates.

| Order | Slice | Depends On | Gate |
|---|---|---|---|
| 001 | Planning-artifact challenge | Frozen Track C decision | `READY_WITH_NOTES` in `reviews/slice-001-r01.md`. |
| 002 | Scope packet | 001 or explicit isolation | `READY_WITH_NOTES` in `reviews/slice-002-r01.md`. |
| 003 | Approach selection | 002 if `design-doc-refiner` overlaps | `READY_WITH_NOTES` in `reviews/slice-003-r01.md`. |
| 004 | Review-gate completeness | 001-003 or explicit skip decision | `READY_WITH_NOTES` in `reviews/slice-004-r01.md`. |

## Child Index

| path | artifact | status | order | description |
|---|---|---|---|---|
| `slice-001-plan-challenge-gate.md` | task-slice | reviewed | 001 | Slice 1: review and finalize planning-artifact challenge absorption. |
| `slice-002-scope-packet.md` | task-slice | reviewed | 002 | Slice 2: add source-claim and confidence scoping guidance. |
| `slice-003-approach-selection.md` | task-slice | reviewed | 003 | Slice 3: add approach-selection alternatives guidance. |
| `slice-004-review-gate-completeness.md` | task-slice | reviewed | 004 | Slice 4: add review completeness and validation-gap checks. |
