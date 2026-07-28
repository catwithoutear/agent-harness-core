---
artifact: plan
status: draft
tags: [workflow, migration, validation, rollback]
description: "Convergence plan for the workflow design-stage gate."
---

# Convergence Plan

## Goal

Make the Core workflow enforce this order for non-trivial design work:

```text
proposal -> reviewed solution design -> implementation-design assessment
         -> reviewed implementation design when required
         -> reviewed task slices -> implementation
```

Keep fast and compact paths for work that does not need the full chain.

## Current State

- The directional proposal is stable.
- The solution design was simplified after the owner rejected a separate
  bootstrap prefix writer.
- The bounded migration cleanup is reviewed `READY`.
- The owner accepted exact migration plan
  `1e21ce201af7f01d51785d253cd432188daf154ee1ff2e8682672f5376a2c9d4`.
- The controlled migration committed and Node/Python idempotent verification,
  archive, provenance, strict-layout, and destination checks passed.
- `migration-apply-bootstrap-v1` and `migration-apply-bootstrap-v2` are
  terminally revoked and remain historical records.
- No active bootstrap authority exists, no V3 authority will be created, and
  no historical control file was changed.
- The workspace is structured. Its implementation-design pack is drafted, but
  independent review returned `NEEDS_USER_DECISION`; task slicing and source
  implementation remain blocked.

## Owner Decision

For the workflow-stage implementation, the owner removed the five-field
mechanical gate-reference direction. The implementation must solve the simpler
problem: make proposal, solution design, implementation design, task slicing,
and implementation responsibilities and order clear enough that the active AI
can read and follow them.

No gate digest protocol, reviewed-input schema, phase version, mutable state,
new command, or semantic validator is authorized. Reviews and source pointers
remain readable evidence, not a parallel workflow engine.

For migration of this change, the accepted transaction authorization is:

1. a fresh dry run;
2. the exact target change and resolved state root;
3. the target-workspace source snapshot and destination manifest in that plan;
4. explicit owner acceptance of `plan_sha256`;
5. apply with the same digest and no intervening drift.

This authorizes one accepted transaction, including recovery of that exact
interrupted transaction and idempotent verification after commit. It is not
identity authentication and does not authorize a changed plan or second
transaction. The plan binds conversion data, not tool implementation; Core's
normal source review/test boundary owns tool integrity. Immediately before this
self-hosting apply, the coordinator must also confirm that the reviewed
migration source diff is unchanged.

This replaces the abandoned prefix-writer direction. It does not authorize
migration until a fresh dry-run packet is presented and explicitly accepted in
the active interaction.

## Ordered Checkpoints

### 1. Review The Simplified Design

Status: complete (`design-r16`, `READY`, carried into structured
`solution-design-r01`).

- Run multi-lens review over phase boundaries, lifecycle, failure recovery,
  implementation readiness, compatibility, and artifact chain.
- Resolve every blocker in `design.md`.
- Append a new frozen design-review round; do not rewrite historical rounds.

Gate: `READY` or an explicitly accepted `READY_WITH_NOTES`.

### 2. Complete The Bounded Migration Cleanup

Status: complete (`bounded-migration-cleanup-r01`, `READY`).

- Remove Node/Python migration apply's obsolete bootstrap admission.
- Remove `bootstrap-close` and `bootstrap-revoke` from public command/policy
  surfaces.
- Retain read-only V1/V2 historical parsing and diagnostics.
- Update focused tests and directly affected guidance only.
- Run focused migration transaction, revoked-history, and Node/Python parity
  tests.
- Independently review the exact cleanup diff and evidence in a frozen legacy
  round.

Gate: focused tests pass and source review is ready.

This checkpoint is migration enablement, not workflow-stage implementation. It
must not add state, protocols, commands, unrelated changes, a pack, or slices.

### 3. Prepare Exact Migration Evidence

Status: complete; exact packet accepted by the owner.

- Run change validation in legacy mode.
- Run migration dry-run without writes.
- Record target change, canonical state root, target-workspace source snapshot,
  destination manifest, and `plan_sha256`.
- Confirm the reviewed migration source diff still matches its accepted review
  evidence.
- Confirm V1/V2 records remain unchanged and terminal.

Gate: explicit owner acceptance of that exact packet.

### 4. Apply And Validate Migration

Status: complete (`migration-r01`, `READY`).

- Apply only with the accepted `plan_sha256`.
- Reject and repeat checkpoint 3 if migration inputs changed. Return to
  checkpoint 2 only if the cleanup diff or its review evidence changed.
- Validate archive bytes, provenance, structured anchors, transaction state,
  and Node/Python agreement.
- Confirm no implementation-design pack or task slice was created by migration.

Gate: migration committed and change validation passes.

### 5. Create And Review Implementation Design

Status: complete. Pack created and populated; round
`implementation-design-r01` recorded the rejected mechanical direction. Owner
decision `DR-002-stage-gate-simplification` resolves that blocker; simplified
design review `solution-design-r03` and pack review
`implementation-design-r03` are both `READY`.

The trigger is `required` because the future source change crosses workflow
skills, command admission, validators, schema, documentation, and tests.

- Create the standard implementation-design pack only after migration.
- Map the accepted design to source ownership, dependency order, runtime flow,
  failure behavior, implementation sequence, constraints, and tests.
- Review and refine the pack until ready.

Gate: populated pack review is ready.

### 6. Slice And Implement

- Derive bounded task slices from the accepted pack.
- Review the complete task set for ownership, dependency order, and validation.
- Implement one slice at a time with review and verification.

Gate: all slices complete with current review and command evidence.

Status: task slicing complete (`task-set-r01`, `READY`). Implementation has not
started. Dispatch requires a separately preserved migration/tooling baseline or
an equivalent clean worktree with its base commit recorded.

## Forbidden Shortcuts

- Do not create `migration-apply-bootstrap-v3`.
- Do not restore or replace `bootstrap-prefix-writer`.
- Do not reactivate or rewrite V1/V2.
- Do not hand-edit `.changes/.control/`.
- Do not expose `bootstrap-close` or `bootstrap-revoke` as supported commands
  in the eventual source change; retain only read-only historical diagnostics.
- Do not run migration apply before exact dry-run approval.
- Do not create `specs/`, `implementation-design/`, structured reviews,
  decisions, timeline events, or task slices before migration commits.
- Do not slice tasks before the required implementation-design pack is ready.

## Validation Boundary

Before migration apply, run:

- change-workspace validation;
- design review and evidence checks;
- `git diff --check`;
- focused migration transaction, revoked-history, and Node/Python parity tests
  for the bounded cleanup;
- focused confirmation that writer assets, executable entry points, and
  positive dependency references are absent; historical and explicit
  prohibition references may remain.

The full source suite remains required after the implementation plan is
accepted and source changes are finalized.

## Rollback

- Historical review rounds and V1/V2 control records remain immutable.
- A stale dry-run digest authorizes nothing; generate a new plan.
- An interrupted migration uses the existing transaction resume/rollback
  behavior.
- The removed prefix-writer draft and source spike are recoverable from the
  temporary deletion archives until this simplification is accepted.
