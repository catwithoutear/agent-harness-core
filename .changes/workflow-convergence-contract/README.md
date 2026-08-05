---
artifact: change-index
status: reviewed
tags: [workflow]
description: "Continuous convergence contract for the generic harness workflow."
---

# Workflow Convergence Contract

## Task Tag Registry

| tag | description |
|---|---|
| `workflow-convergence-contract` | Generic workflow semantics for continuing until the overall objective passes or needs an owner decision. |

## Task Summary

- Task: make the explicit instruction "follow the workflow and converge" keep
  iterating until the overall objective is complete.
- Source: the user decision in the active interaction and current canonical
  workflow assets.
- Boundary: project-agnostic prompt semantics only. Do not add a scheduler,
  background worker, client-specific state machine, or permission model.

## Current Phase

- Phase: implementation, superseding review, and verification complete.
- Owner: coordinator.
- Next checkpoint: none; ready for normal commit or publication handling.

## Artifact Index

| Artifact | Status | Purpose |
|---|---|---|
| `plan.md` | reviewed | Bounded implementation, validation, and rollback contract. |
| `reviews/README.md` | reviewed | Review index. |
| `reviews/implementation-r01.md` | superseded | Historical review of the original fixed-phrase trigger. |
| `reviews/implementation-r02.md` | reviewed | Superseding semantic-conjunction trigger review; decision `READY`. |
