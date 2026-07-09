---
artifact: task-slice
status: reviewed
tags: [implementation, worktree-work-promote, validation]
description: "Slice 4: add JS worktree validation for execution-map rows and evidence references."
---
# Slice: js-worktree-validation

## Objective

Validate execution-map consistency and linked-worktree hazards in the JS
validator.

## Scope

- Source design: `implementation-design/04-runtime-flow.md` fail-fast,
  dependency-status, and worktree severity tables;
  `implementation-design/05-error-model.md`; `reviews/implementation-design-r03.md`.
- Goal: `harness-change-validate --worktrees` reports deterministic errors and
  warnings for execution-map shape, task-slice links, evidence references,
  topology, dependencies, duplicate worktrees, duplicate local `.changes`, and
  path liveness.
- Non-goals: command upsert behavior, Python parity, workflow prompt changes,
  or cleanup/removal of accidental duplicate `.changes`.
- Scope: JS validator parsing/checking, status JSON summaries, and focused
  validator tests.
- Subsystem: worktree-aware change validation.
- Module: JS validator.
- Changed surfaces: `lib/change/validator.js:runChangeValidate`,
  `lib/change/validator.js:buildStatusReport`, shared execution-map parser
  if introduced in slice 003, and `tests/test-change-tools.js`.
- Prerequisites: slice 001 for artifact policy, slice 002 for root context,
  slice 003 for map parser/fixtures.

## Steps

- [x] Parse and validate required execution-map columns.
- [x] Check that every referenced `Slice` exists under `tasks/slice-*.md`.
- [x] Validate `Last Evidence` grammar and existence: blank gated values,
      absolute paths, `..` escapes, missing files, non-Markdown fragments, and
      missing Markdown heading fragments are errors.
- [x] Validate topology: `parallel`/`standalone` have no dependencies;
      `stacked` has dependency or base; dependencies exist; cycles error.
- [x] Validate `stacked` status gates: `ready` depends only on `ready` or
      `merged`; `merged` depends only on `merged`.
- [x] Validate duplicate active worktree realpaths among non-terminal rows.
- [x] Validate missing, unreadable, non-git, and duplicate
      `.changes/<change>` assigned worktrees using the status-specific severity
      table.
- [x] Extend status JSON with execution-map presence, active assignment count,
      and whether `--worktrees` checks were requested.

## Validation

- [x] `node tests/run-tests.js --change-tools`: passed after validator tests were added before implementation and initially showed `--worktrees` was ignored.
- [x] Fixture tests for every error/warning class in
      `implementation-design/04-runtime-flow.md`.
- [x] Fixture tests for valid and invalid `Last Evidence` references.
- [x] Fixture tests for terminal duplicate local state warning vs non-terminal error.
- [x] Status JSON fixture for `execution_map.exists`, `assignment_count`, `active_assignment_count`, and `worktrees_checked`.
- [x] `node bin/harness-change-validate.js --repo-root . --change worktree-work-promote --strict-layout`: ready, 0 errors, 0 warnings.
- [x] `git diff --check -- lib/change/execution-map.js lib/change/validator.js tests/test-change-tools.js`: passed.

## Review

- Review packet: validator diff, fixture matrix, status JSON example, and
  explicit list of warning-vs-error decisions.
- Review owner: reviewer for validation correctness and failure semantics.
- Review round: `reviews/slice-004-r01.md`.
- Gate: `READY`.

## Rollback

- Revert `--worktrees` validation path, status JSON extensions, parser changes
  not needed by slice 003, and tests. Validator remains read-only throughout.

## Open Decisions

- None
