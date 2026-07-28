---
artifact: task-slice
status: reviewed
tags: [implementation]
description: "template-and-user-guidance"
---
# Slice: template-and-user-guidance

## Objective

Align the implementation-design template and paired user guidance with the
canonical stage order without adding new required fields or ceremony.

## Scope

- Source design: `design.md`; `implementation-design/README.md`;
  `implementation-design/06-implementation-plan.md`; accepted slice 001
  contract.
- Goal: users and generated packs understand that solution design settles
  behavior, implementation design conditionally maps topology, and reviewed
  tasks follow.
- Non-goals: change-tool behavior, template fields requiring machine parsing,
  mechanical gate evidence, projector behavior, or unrelated README content.
- Scope: implementation-design template, README/README_CN semantic guidance,
  and focused source assertions.
- Subsystem: workflow coordination.
- Module: user and artifact guidance.
- Changed surfaces: `templates/changes/implementation-design/README.md`,
  `README.md`, `README_CN.md`, and relevant `tests/test-skills.js` assertions.
- Prerequisites: slice 001 is reviewed `READY_WITH_NOTES`; its task-owned commit
  `4075ed3` is the recorded base for this stacked slice. The note requires
  excluding pre-existing untracked `.pyc` files from commits.

## Steps

- [x] Update the pack template to state that it maps a settled solution and is
  reviewed before task slicing.
- [x] Explain fast, compact, and design paths consistently in README and
  README_CN without exposing internal implementation mechanics.
- [x] Add assertions that user/template guidance preserves lightweight paths
  and does not require a mechanical evidence protocol.
- [x] Review the paired English/Chinese sections for semantic equivalence.

## Validation

- [x] `npm test -- --skills`: passes.
- [x] `node bin/harness.js manifest --json`: passes.
- [x] `git diff --check`: passes.
- [x] Paired documentation review finds no semantic drift.

## Review

- Review packet: slice-001 base, task-owned diff, template output, paired
  sections, focused tests, and explicit no-new-field check.
- Review owner: independent reviewer for clarity, lightweight-path preservation,
  paired meaning, and Core generality.

## Rollback

- Revert the task-owned commit, retain slice 001, and regenerate projections.

## Open Decisions

- None
