---
artifact: task-slice
status: reviewed
tags: [implementation, worktree-work-promote, execution-map]
description: "Slice 1: register execution-map artifact across policy, schema, status, and inventory."
---
# Slice: policy-schema-execution-map

## Objective

Register `execution-map.md` as a first-class change-workspace artifact before
any command depends on it.

## Scope

- Source design: `implementation-design/06-implementation-plan.md` step 1;
  `implementation-design/03-class-design.md` "Execution-map artifact contract";
  `reviews/implementation-design-r03.md` WWP-R03-F01 and WWP-R03-F02.
- Goal: validators, indexes, policy output, and status/inventory paths recognize
  `execution-map.md` as an allowed structured workspace artifact.
- Non-goals: root resolution, `assign-slice`, worktree validation, Python CLI
  command parity, prompt/skill wording, or git worktree lifecycle operations.
- Scope: artifact policy, schema/layout allowlist, strict-layout behavior,
  status/inventory visibility, and focused tests.
- Subsystem: change workspace policy and layout.
- Module: artifact/schema policy.
- Changed surfaces: `lib/change/js-policy.js:ARTIFACTS`,
  `lib/change/policy.py:ARTIFACTS`,
  `schemas/change-workspace.schema.json:layout.allowed_files_by_mode`,
  `lib/change/validator.js:buildStatusReport` or adjacent status/inventory
  code if policy metadata is not sufficient, and `tests/test-change-tools.js`.
- Prerequisites: implementation design gate `READY` in
  `reviews/implementation-design-r03.md`; no code slice prerequisites.

## Steps

- [x] Add `execution-map` artifact metadata and command names to JS policy.
- [x] Mirror artifact metadata in Python policy.
- [x] Allow `execution-map.md` in structured change workspaces and adjust the
      top-level file budget only if the existing limit rejects a valid
      workspace containing the new artifact.
- [x] Surface execution-map presence in status/inventory/index behavior without
      creating the file automatically.
- [x] Add focused tests for policy output, strict layout, inventory/index
      visibility, and status output.

## Validation

- [x] `node bin/harness-change-doc.js --repo-root . policy --json`: `execution-map` appears in JS/Python-backed policy output with `execution-map.md` naming and global tag registration.
- [x] `node tests/run-tests.js --change-tools`: passed focused change-tool suite after the new tests failed before implementation.
- [x] `node bin/harness-change-validate.js --repo-root . --change worktree-work-promote --strict-layout`: ready, 0 errors, 0 warnings.
- [x] `node bin/harness-change-validate.js --repo-root . --change worktree-work-promote --inventory --json`: no errors/warnings; inventory has no unexpected files for the current workspace.
- [x] `git diff --check -- lib/change/js-policy.js lib/change/policy.py schemas/change-workspace.schema.json lib/change/validator.js tests/test-change-tools.js`: passed.

## Review

- Review packet: policy/schema diff, sample status/inventory output, focused
  change-tool test output, and confirmation that no command behavior was added.
- Review owner: reviewer for artifact policy and schema compatibility.
- Review round: `reviews/slice-001-r01.md`.
- Gate: `READY`.

## Rollback

- Revert policy/schema/status/inventory changes and focused tests. No persisted
  user data migration is introduced in this slice.

## Open Decisions

- None
