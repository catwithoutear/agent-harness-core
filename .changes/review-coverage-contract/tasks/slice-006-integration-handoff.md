---
artifact: task-slice
status: reviewed
tags: [implementation, review, validation]
description: "Slice 6: complete integration verification, final review, and handoff evidence."
---
# Slice: integration-handoff

## Objective

Prove that the completed slices form one project-agnostic, self-projected
package and record the final implementation review decision and residual risk.

## Scope

- Source design: `implementation-design/06-implementation-plan.md` step 6;
  `07-constraints.md` self check; repository `AGENTS.md` verification contract.
- Goal: complete source, manifest, projection, change-workspace, review, and
  handoff verification without widening the accepted V1 protocol.
- Non-goals: feature expansion, unrelated cleanup, manual projected-file
  editing, ignoring a failing slice gate, or claiming fresh-agent evidence that
  slice 005 did not establish.
- Scope: full verification, source projection refresh only through the project
  tool when required, final implementation review, findings disposition, and
  task/change evidence updates.
- Subsystem: package integration and handoff.
- Module: existing test runner, manifest/projector, regulated change workspace,
  and review records.
- Changed surfaces: final test/review/evidence docs, `tasks.md`, and generated
  projection output only through `harness-project` if verify identifies drift.
- Prerequisites: slices 001-005 have a recorded review gate. A slice-005
  `READY_WITH_NOTES` limitation must be carried into the final assurance label.

## Steps

- [x] Run the repository verification set required by `AGENTS.md` and retain
      exact commands/results in the final review packet.
- [x] Refresh self-hosted Codex projection through `harness-project` only if
      projection verification reports drift; rerun verification afterwards.
- [x] Conduct an independent final implementation review covering helper bytes,
      packet/fixture contract, roles/manifest/projection, routing, and the
      behavioral-evidence boundary.
- [x] Resolve every concrete final-review finding, rerun affected validation,
      and record the disposition before marking the change ready.
- [x] Update task status/evidence and prepare a handoff that distinguishes
      deterministic verification from bounded agent-evaluation evidence.

## Validation

- [x] `npm test` passes.
- [x] `node bin/harness.js manifest --json` reports `ok: true` with no errors
      or warnings.
- [x] `node bin/harness-project.js --target . --clients codex --content rules,templates,skills,subagents,hooks --verify --json` reports `ok: true` after any required tool-mediated refresh.
- [x] `node bin/harness-change-validate.js --state-root . --change review-coverage-contract --strict-layout` reports zero errors and warnings.
- [x] `git diff --check` passes.

## Review

- Review packet: complete diff summary, all slice review records, full command
  output, manifest/projection status, final findings disposition, and residual
  risk/fidelity statement.
- Review owner: final implementation reviewer using contract, compatibility,
  security/authority, projection, verification, and simplicity lenses.
- Gate: `READY` only when all deterministic gates pass and no unresolved final
  finding remains; carry slice-005 limitations as `READY_WITH_NOTES` rather
  than hiding them.

## Rollback

- Revert only the bounded source and generated projection changes belonging to
  a failing slice; preserve formal review evidence and do not use destructive
  history operations.

## Open Decisions

- None
