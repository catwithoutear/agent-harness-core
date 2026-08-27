---
artifact: change-index
status: superseded
tags: [workflow, review, review-coverage]
description: "Draft change workspace for an auditable delegated review coverage contract."
---

# Review Coverage Contract

## Task Tag Registry

| tag | description |
|---|---|
| `review-coverage` | Traceability from review targets and rules to reviewer dispositions. |
| `review-verification` | Independent verification of code-scope, rule, and evidence coverage. |
| `rule-profile` | A revision-bound set of review rules and applicability triggers. |

## Task Summary

- Task: define a draft contract in which a delegator supplies a neutral review
  target packet, a reviewer returns findings plus a coverage ledger, and an
  independent verifier checks for omitted code, rules, and evidence.
- Source: user discussion on 2026-07-10 plus current harness review, workflow,
  planning-review, and simplification contracts.
- Confirmed decisions:
  - Extend the existing Review -> Verify chain instead of creating a parallel
    workflow.
  - Treat the delegator packet as a scope seed and review claim, not as the sole
    authority for completeness.
  - Cover semantic units and impacted surfaces; use line ranges only as
    revision-bound supporting anchors.
  - Require explicit per UnitKey-plus-rule disposition through pass, finding,
    justified N/A, needs-context, or skipped states.
  - Separate review-coverage assurance from claims that the code is defect-free.
  - Scale the protocol through quick, standard, and deep coverage modes.
  - Keep this change in draft review; do not implement skills, roles, manifest
    entries, projections, schemas, or tests yet.

## Current Phase

- Phase: Superseded on 2026-08-13 by `.changes/review-coverage-deep-rebuild/`.
- Owner: coordinator.
- Disposition: historical evidence only; no runtime compatibility route or
  independent implementation may be added from this fork.
- Current authoritative design: `.changes/review-coverage-deep-rebuild/` and
  its frozen decision/review chain.
- Open blockers: none for historical preservation; all implementation work
  follows the replacement workspace.

## Artifact Index

| Artifact | Status | Purpose |
|---|---|---|
| `requirements.md` | frozen | Required guarantees, boundaries, and acceptance criteria. |
| `research.md` | frozen | Current-source evidence and guarantee limits. |
| `proposal.md` | frozen | Alternative approaches and recommended direction. |
| `design.md` | frozen | Packet, ledger, verifier, gate, and invalidation contracts. |
| `terminology.md` | frozen | Task-local definitions for coverage and verification terms. |
| `specs/` | frozen | Behavioral contract for target identity, per-rule results, verification, and gate composition. |
| `implementation-design/` | reviewed | Topology, packet, role, failure, validation, and ordered-slice constraints. |
| `tasks.md` | reviewed | Next-phase prerequisite and task-slicing boundary. |
| `reviews/` | reviewed | Authoritative draft and implementation-design review chain. |
