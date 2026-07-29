---
artifact: task-slice
status: reviewed
tags: [implementation]
description: "Slice: monotonic-migration"
---
# Slice: monotonic-migration

## Objective

Replace controlled migration protocol machinery with the reviewed monotonic
filesystem upgrade in one behaviorally complete slice.

## Scope

- Source design: `design.md` and reviewed `implementation-design/`.
- Goal: archive exact legacy bytes, scaffold structured files, and recover by
  rerunning without transaction state.
- Non-goals: change state-root/worktree behavior or translate legacy prose.
- Scope: migration commands, validators, command policy, docs, tests, and
  obsolete Core control records.
- Subsystem: change workspace lifecycle.
- Module: Node/Python change tools and shared user contract.
- Changed surfaces: `lib/change/doc-tool.js`,
  `lib/change/harness_change_doc.py`, `lib/change/validator.js`,
  `lib/change/harness_change_validate.py`, `lib/change/js-policy.js`,
  `tests/test-change-tools.js`, `tests/test-skills.js`, `README.md`,
  `README_CN.md`, and
  `skills/change/change-workspace-operator/SKILL.md`, plus the prior change
  index `.changes/workflow-design-stage-gate/README.md`.
- Removed control records:
  `.changes/.control/migration-bootstrap-v1/`,
  `.changes/.control/migration-bootstrap-v2/`, and
  `.changes/.control/migrations/workflow-design-stage-gate/`.
- Prerequisites: implementation-design review `READY`.

## Steps

- [x] Replace Node migration helpers and command contract.
- [x] Mirror the behavior in Python.
- [x] Remove transaction/bootstrap validation.
- [x] Update docs and policy.
- [x] Replace protocol tests with monotonic migration fixtures.
- [x] Remove obsolete Core control records and dead protocol code.

## Validation

- [x] Focused tests cover all source/archive matrix rows, exact JSON fields and
  ordering, exit classes, transform-in-place and create-if-missing paths,
  non-UTF-8 legacy bytes, directory/symlink rejection, archive conflict with
  source retention, partial rerun, and post-migration-edit no-op preservation
  in both Node and Python.
  Include invalid UTF-8 in a transform-in-place Markdown file and a
  create-if-missing destination with different bytes; both must fail before
  source removal.
- [x] The following command returns no matches:
  `rg -n '(expected-plan-sha256|plan_sha256|migration transaction|migration_transaction|migration-bootstrap|bootstrap lifecycle|frozen review round|frozen_review_round)' lib/change/doc-tool.js lib/change/harness_change_doc.py lib/change/validator.js lib/change/harness_change_validate.py lib/change/js-policy.js tests/test-change-tools.js tests/test-skills.js README.md README_CN.md skills/change/change-workspace-operator/SKILL.md`.
- [x] `npm test`.
- [x] `node bin/harness.js manifest --json`.
- [x] `node bin/harness-project.js --target . --clients codex
  --content rules,templates,skills,subagents,hooks --verify --json`.
- [x] `node bin/harness-change-validate --state-root . --change
  change-migration-simplification`.
- [x] `node bin/harness-change-validate --state-root . --change
  workflow-design-stage-gate`.
- [x] `git diff --check`.

## Review

- Review packet: exact slice diff, tests, source search, and change validation.
- Review owner: independent reviewer; round 1 gate `READY`.

## Rollback

- Restore this slice with Git; no production or user workspace migration is run.

## Open Decisions

- None
