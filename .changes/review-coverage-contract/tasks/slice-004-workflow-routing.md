---
artifact: task-slice
status: reviewed
tags: [implementation, review, validation]
description: "Slice 4: route review coverage modes and four independent gates through workflows and commands."
---
# Slice: workflow-routing

## Objective

Route the coverage modes, helper prerequisite, delegated verification, and four
independent gates through existing workflow owners without creating another
workflow root.

## Scope

- Source design: `implementation-design/04-runtime-flow.md` main/failure flow;
  `06-implementation-plan.md` step 4; `specs/review-coverage.md` proportional
  modes and separate-gate requirements.
- Goal: workflow skill and review/workflow commands select no-mode/quick/
  standard/deep behavior consistently, dispatch verifier work only when
  eligible, and preserve distinct coverage, review, implementation-verification,
  and overall decisions.
- Non-goals: client orchestration implementation, automatic rule discovery,
  helper changes, new commands, project-specific trigger lists, or replacing
  existing verification-first/council paths.
- Scope: declarative workflow/command routing text and static route assertions.
- Subsystem: evidence-gated workflow control.
- Module: `workflow-control` skill and existing harness review/workflow
  command prompts.
- Changed surfaces: `skills/workflow/workflow-control/SKILL.md`,
  `commands/harness/review.md`, `commands/harness/workflow.md`, and
  `tests/test-skills.js`.
- Prerequisites: slices 001-003 `READY`; mode routing must reference the real
  helper, packet, reviewer, verifier, and manifest boundaries.

## Steps

- [x] Add failing static route assertions for legacy no-mode, quick, standard,
      deep, mandatory escalation/downgrade, helper failure, and all four gate
      decisions.
- [x] Add the smallest workflow-control clauses that order target identity,
      reviewer/verifier dispatch, comparison, correctness review, and
      implementation verification.
- [x] Update review/workflow commands to route explicit modes and fail closed
      for deep fingerprint/seal/source failures while retaining existing
      no-mode workflow.
- [x] Confirm that command text delegates analysis to the established owners
      instead of duplicating packet/role rules.

## Validation

- [x] `npm test -- --skills` fails before routing text is added and passes
      afterwards.
- [x] Static source assertions cover every routing case and preserve a
      no-coverage-mode branch with no verifier or coverage assurance claim.
- [x] `git diff --check -- skills/workflow/workflow-control/SKILL.md commands/harness/review.md commands/harness/workflow.md tests/test-skills.js` passes.

## Review

- Review packet: command/skill diff, routing matrix, focused test output, and
  traceability to deep trigger, downgrade, and four-gate requirements.
- Review owner: workflow-control reviewer using compatibility, fail-closed,
  ownership, and operator-flow lenses.
- Gate: `READY` only when declared routing is mutually exclusive where needed,
  preserves no-mode behavior, and does not overclaim automation.

## Rollback

- Revert coverage-routing clauses and source assertions; current review and
  verification loop remains intact.

## Open Decisions

- None
