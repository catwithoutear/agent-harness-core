---
artifact: change-index
status: reviewed
tags: [workflow, review, validation, canonical-subagent-roles]
description: "Complete canonical subagent role contracts before any client projection work."
---

# Canonical Subagent Role Contracts

## Task Tag Registry

| tag | description |
|---|---|
| `canonical-subagent-roles` | Canonical role prompts that must remain independently dispatchable across clients. |

## Task Summary

- Task: complete under-specified canonical subagent role descriptions in
  `agents/roles/` before doing any client projection work.
- Source: user direction on 2026-08-04 plus current canonical roles and the
  same-purpose prompts under `~/.config/opencode/agents/`.
- Confirmed decisions:
  - restore only project-agnostic role semantics;
  - do not copy product facts, local environment details, client metadata, or
    client-specific tool policy into canonical bodies;
  - do not rewrite already-complete roles merely to increase prompt length;
  - complete and review canonical role contracts before touching projection.

## Current Phase

- Phase: canonical role contracts completed, reviewed, and source-validated.
- Owner: coordinator.
- Current authoritative review: `reviews/canonical-roles-r01.md`.
- Next checkpoint: client projection remains a separate later phase and has not
  started in this change stage.

## Artifact Index

| Artifact | Status | Purpose |
|---|---|---|
| `plan.md` | draft | Bounded role-source scope, semantic map, validation, and rollback. |
| `reviews/` | reviewed | Canonical role-body completeness gate and findings. |
