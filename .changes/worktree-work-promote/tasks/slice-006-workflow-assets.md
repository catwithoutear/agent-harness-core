---
artifact: task-slice
status: reviewed
tags: [implementation, worktree-work-promote, workflow]
description: "Slice 6: update workflow prompts, hooks, and skills for worktree-aware state roots."
---
# Slice: workflow-assets

## Objective

Teach harness workflow assets to use the finalized root-resolution and
execution-map contract without creating a parallel process framework.

## Scope

- Source design: `implementation-design/02-code-topology.md` workflow prompt,
  hook, and skill anchors; `implementation-design/06-implementation-plan.md`
  step 6.
- Goal: agents following workflow, handoff, bootstrap, active-change, and
  change-planning instructions resolve state/code roots explicitly and use the
  execution map for multi-worktree assignment.
- Non-goals: adding new command behavior, changing projected runtime files by
  hand, adding project-specific branch/worktree naming, or documenting
  `branch-local-state` as implemented.
- Scope: source prompts, hooks, skills, and their tests.
- Subsystem: workflow instruction assets.
- Module: commands, hooks, and skills.
- Changed surfaces: `commands/harness/workflow.md`,
  `commands/harness/handoff.md`, `hooks/intents/session-bootstrap.md`,
  `hooks/intents/active-change-guard.md`,
  `skills/change/change-workspace-operator/SKILL.md`,
  `skills/change/change-planner/SKILL.md`,
  `skills/operations/handoff-checkpoint/SKILL.md`,
  `tests/test-skills.js`, and `tests/test-subagents-hooks.js`.
- Prerequisites: slices 001-005 complete, because workflow text must mirror the
  public tool behavior rather than planned behavior.

## Steps

- [x] Update workflow command guidance to resolve `state_root`, `code_root`,
      and `active_change` before regulated writes.
- [x] Update handoff guidance to include execution-map state when present and
      to treat `Worktree` as a local execution coordinate.
- [x] Update bootstrap and active-change guards to warn on linked-worktree
      ambiguity and avoid dirty-status activation.
- [x] Update change workspace/change planner/handoff skills with the new root
      options, execution-map contract, evidence-reference rules, and
      dependency-ordered task slicing.
- [x] Add or update tests that lock the new wording and prevent
      `branch-local-state` from appearing as supported V1 behavior.

## Validation

- [x] `node tests/run-tests.js --skills --subagents`
- [x] `node tests/run-tests.js --change-tools --skills --subagents`
- [x] Projection verify is expected in slice 007 after all source asset changes
      land.
- [x] `git diff --check`

Evidence:

- `node tests/run-tests.js --skills --subagents`: passed after workflow asset wording updates.
- `node tests/run-tests.js --change-tools --skills --subagents`: passed.
- `node bin/harness-change-validate.js --repo-root . --change worktree-work-promote --strict-layout`: ready, 0 errors, 0 warnings.
- `git diff --check -- commands/harness/workflow.md commands/harness/handoff.md hooks/intents/session-bootstrap.md hooks/intents/active-change-guard.md skills/change/change-workspace-operator/SKILL.md skills/change/change-planner/SKILL.md skills/operations/handoff-checkpoint/SKILL.md tests/test-skills.js tests/test-subagents-hooks.js`: passed.

## Review

- Review packet: source asset diffs, tests showing prompt/skill wording is
  locked, and confirmation no projected runtime file was hand-edited.
- Review owner: reviewer for workflow instruction accuracy and core-vs-overlay
  boundaries.
- Review round: `reviews/slice-006-r01.md`
- Gate: `READY`; proceed to slice 007.

## Rollback

- Revert source asset and test changes. If projection output was refreshed
  later, revert source/projection together in slice 007.

## Open Decisions

- None
