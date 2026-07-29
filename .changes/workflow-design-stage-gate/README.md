---
artifact: change-index
status: reviewed
tags: [workflow, proposal, design, validation]
description: "Draft phase-gate contract separating proposal, design, and implementation design."
---

# Workflow Design Stage Gate

## Task Tag Registry

| tag | description |
|---|---|
| `workflow-design-stage-gate` | Core workflow clarification for proposal, solution design, implementation design, and task-slicing gates. |

## Task Summary

- Task: remove ambiguity between `design.md` and `implementation-design/` in
  the generic Core workflow.
- Source: current workflow assets, change-workspace tool behavior, and the
  review-verifier V2 design-stage correction recorded on 2026-07-22.
- Relationship: this is a workflow improvement task, not a review-verifier V2
  protocol change. It may reference V2 as evidence, but it must not alter that
  protocol or merge the two task scopes.
- Boundary: Core-only; no product, UI, client-specific, tracker, or language
  workflow is in scope.

## Current Phase

- Phase: implementation, projection, simplification, independent review, and
  repository verification are complete. Final overall gate: `READY`.
- Owner: coordinator.
- Current design evidence: `research.md`, `proposal.md`, the simplified
  `design.md`, and frozen legacy round `design-r16` (`READY`). Round
  `design-r15` is historical because its reviewed design depended on the
  now-rejected prefix writer.
- Historical migration evidence remains in the archived legacy review,
  `decisions/DR-001-migration-provenance.md`, and
  `reviews/migration-r01.md`. The former control registries and transaction
  record were removed by `change-migration-simplification`; they no longer
  participate in validation.
- Current solution-design gate:
  - `change_id`: `workflow-design-stage-gate`
  - `artifact_path`: `.changes/archive/workflow-design-stage-gate/legacy/review-log.md`
  - `decision_id`: `design-r16`
  - `artifact_sha256`: `9a301205738966cff9c534cb099606e713b3ebbd1c6aded74cceaa52a19a14b2`
  - `decision`: `READY`
- Current bounded-cleanup gate:
  - `change_id`: `workflow-design-stage-gate`
  - `artifact_path`: `.changes/archive/workflow-design-stage-gate/legacy/review-log.md`
  - `decision_id`: `bounded-migration-cleanup-r01`
  - `artifact_sha256`: `e1060dd02502703171abfe9fc03e7976a9312e27264163a7a28907ee41f89f00`
  - `decision`: `READY`
- Historical migration result: the legacy bytes remain archived and the
  structured workspace remains valid. Future migrations use the direct
  archive-first, rerunnable file upgrade and do not fabricate review rounds,
  implementation design, or task slices.
- Current implementation-design history:
  `reviews/implementation-design-r01.md` is superseded by owner decision
  `decisions/DR-002-stage-gate-simplification.md`.
- Current solution-design gate: `reviews/solution-design-r03.md`, `READY`.
- Current implementation-design gate:
  `reviews/implementation-design-r03.md`, `READY`.
- Current task-set gate: `reviews/task-set-r01.md`, `READY`.
- Next checkpoint: none. The change is ready for normal publication or release
  handling.

## Artifact Index

| Artifact | Status | Purpose |
|---|---|---|
| `research.md` | draft | Current source facts and ambiguity analysis. |
| `proposal.md` | draft | Directional phase model, boundaries, and risks. |
| `design.md` | draft | Phase order, lightweight paths, evidence gates, legacy migration, and direct exact-plan authorization. |
| `plan.md` | draft | Ordered convergence checkpoints after removing the prefix-writer direction. |
| `decisions/DR-001-migration-provenance.md` | frozen | Exact archive and legacy-review provenance. |
| `reviews/migration-r01.md` | reviewed | Checkpoint-4 migration transaction gate. |
| `reviews/solution-design-r01.md` | reviewed | Structured lineage for the accepted solution-design gate. |
| `reviews/implementation-design-r01.md` | reviewed | Superseded review of the rejected mechanical direction. |
| `decisions/DR-002-stage-gate-simplification.md` | frozen | Removes mechanical gate references and restores the readable workflow boundary. |
| `reviews/solution-design-r03.md` | reviewed | Final simplified solution-design gate. |
| `reviews/implementation-design-r03.md` | reviewed | Final simplified implementation-design gate. |
| `reviews/task-set-r01.md` | reviewed | Complete task-set gate; slice 001 may dispatch from the recorded baseline. |
| `reviews/slice-001-r01.md` | reviewed | Slice 001 implementation review; `READY_WITH_NOTES`. |
| `reviews/slice-002-r01.md` | reviewed | Slice 002 template and paired user-guidance review; `READY_WITH_NOTES`. |
| `reviews/slice-003-r01.md` | reviewed | Final projection and implementation verification review; overall `READY`. |
| `implementation-design/README.md` | draft | Required implementation topology and source mapping. |
| `specs/README.md` | draft | Structured specification index. |
| `tasks/README.md` | draft | Reviewed task set; slice 001 is ready for implementation from the recorded baseline. |

<!-- harness-migration-status:start -->
## Migration Status

- Workspace mode: `structured`, established by the controlled migration transaction.
- Provenance: `decisions/DR-001-migration-provenance.md`.
- Historical legacy evidence: `.changes/archive/workflow-design-stage-gate/legacy/`.
<!-- harness-migration-status:end -->
