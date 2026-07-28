---
artifact: change-index
status: draft
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

- Phase: slices 001 and 002 are implemented and independently reviewed
  `READY_WITH_NOTES`; the shared note is to exclude pre-existing untracked
  `.pyc` files from commits.
- Owner: coordinator.
- Current design evidence: `research.md`, `proposal.md`, the simplified
  `design.md`, and frozen legacy round `design-r16` (`READY`). Round
  `design-r15` is historical because its reviewed design depended on the
  now-rejected prefix writer.
- Current control evidence: archived legacy round
  `migration-bootstrap-containment-r10`, the immutable migration provenance,
  and structured review `reviews/migration-r01.md`. V1/V2 bootstrap registries
  remain terminal read-only history.
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
- Bootstrap control:
  - `migration-apply-bootstrap-v1`: generation `3`, terminal `revoked`;
    historical replacement points to v2.
  - `migration-apply-bootstrap-v2`: generation `3`, terminal `revoked`;
    containment evidence is `migration-bootstrap-containment-r07`.
  - `migration-bootstrap-containment-r10`: `READY_WITH_NOTES` for the
    append-stable review-boundary repair; it does not reactivate v2 or authorize
    migration.
- Migration gate:
  - accepted `plan_sha256`:
    `1e21ce201af7f01d51785d253cd432188daf154ee1ff2e8682672f5376a2c9d4`;
  - Node apply committed the accepted transaction;
  - Python verified the committed transaction idempotently;
  - archived bytes, provenance, destination manifest, strict layout, and
    Node/Python validation agree;
  - `requirements.md` remains an optional-file warning and does not block the
    implementation-design checkpoint.
- Owner decision: delete `bootstrap-prefix-writer`; do not create V3, reactivate
  V1/V2, or introduce another authority-writing subsystem.
- Resolved direction: exact-plan authorization and the controlled migration are
  complete. The migration created only the structured skeleton and provenance;
  it did not fabricate review rounds, implementation design, or task slices.
- Current implementation-design history:
  `reviews/implementation-design-r01.md` is superseded by owner decision
  `decisions/DR-002-stage-gate-simplification.md`.
- Current solution-design gate: `reviews/solution-design-r03.md`, `READY`.
- Current implementation-design gate:
  `reviews/implementation-design-r03.md`, `READY`.
- Current task-set gate: `reviews/task-set-r01.md`, `READY`.
- Next checkpoint: commit slice 002, record that commit in slice 003, then run
  projection coverage, simplify review, full verification, and final review.

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
| `implementation-design/README.md` | draft | Required implementation topology and source mapping. |
| `specs/README.md` | draft | Structured specification index. |
| `tasks/README.md` | draft | Reviewed task set; slice 001 is ready for implementation from the recorded baseline. |

<!-- harness-migration-status:start -->
## Migration Status

- Workspace mode: `structured`, established by the controlled migration transaction.
- Provenance: `decisions/DR-001-migration-provenance.md`.
- Historical legacy evidence: `.changes/archive/workflow-design-stage-gate/legacy/`.
<!-- harness-migration-status:end -->
