---
artifact: tasks
status: draft
tags: [implementation, validation, worktree-work-promote]
description: "Task checklist for worktree-aware workflow promotion."
---

# Tasks

## 1. Implementation

- [x] Create an implementation-design pack for the V1 `shared-state` model.
- [x] Specify deterministic root resolution and fail-fast behavior before regulated `.changes` writes.
- [x] Specify execution-map artifact ownership and its relationship to task slices.
- [x] Specify slice status transitions and required evidence.
- [x] Specify parallel sibling versus stacked dependency topology.
- [x] Define the smallest command and validator surface for V1.
- [x] Create dependency-ordered implementation task slices under `tasks/`.
- [x] Implement and review slice 001 policy/schema execution-map registration.
- [x] Implement and review slice 002 shared JS root-resolution context.
- [x] Implement and review slice 003 JS execution-map command surface.
- [x] Implement and review slice 004 JS worktree-aware execution-map validation.
- [x] Implement and review slice 005 Python change-tool parity.
- [x] Implement and review slice 006 workflow, handoff, hook, and skill asset updates.
- [x] Implement and review slice 007 final projection and repository verification.

## 1.5. Design Review Follow-up

- [x] Resolve subagent blocker F01: duplicate-root precedence in linked worktrees.
- [x] Resolve subagent blocker F02: validator `--repo-root` / `--state-root` / `--code-root` CLI contract.
- [x] Resolve subagent blocker F03: Python parity or explicit unsupported/deferral decision.
- [x] Carry subagent notes F04-F07 into implementation slice acceptance criteria.
- [x] Record the follow-up readiness review after mechanical validation.
- [x] Resolve multi-lens review notes for `Last Evidence` grammar, worktree path handoff semantics, stale specs wording, and self-check validation state.

## 2. Validation

- [x] Run `node bin/harness-change-validate.js --repo-root . --change worktree-work-promote`.
- [x] Add validator or unit tests once command behavior is implemented.
- [x] Run repository verification required for changed source assets before handoff.
- [x] Run `git diff --check`.

Validation evidence:

- `node bin/harness-change-validate.js --repo-root . --change worktree-work-promote`: ready, 0 errors, 0 warnings.
- `git diff --check -- .changes/worktree-work-promote`: passed.
- `node bin/harness-change-validate.js --repo-root . --change worktree-work-promote --strict-layout`: ready, 0 errors, 0 warnings after follow-up convergence.
- `node bin/harness-change-doc.js --repo-root . index worktree-work-promote --json`: all current artifacts indexed; diagnostics empty.
- `git diff --check -- .changes/worktree-work-promote`: passed after follow-up convergence.
- `node bin/harness-change-validate.js --repo-root . --change worktree-work-promote --strict-layout`: ready, 0 errors, 0 warnings after final detailed-design convergence.
- `git diff --check -- .changes/worktree-work-promote`: passed after final detailed-design convergence.
- `node bin/harness-change-validate.js --repo-root . --change worktree-work-promote --strict-layout`: ready, 0 errors, 0 warnings after task slicing.
- `node bin/harness-change-doc.js --repo-root . index worktree-work-promote --json`: task slices indexed; diagnostics empty.
- `git diff --check -- .changes/worktree-work-promote`: passed after task slicing.
- `node bin/harness-change-doc.js --repo-root . policy --json`: `execution-map` artifact/global tag present after slice 001.
- `node tests/run-tests.js --change-tools`: passed after slice 001.
- `node bin/harness-change-validate.js --repo-root . --change worktree-work-promote --strict-layout`: ready, 0 errors, 0 warnings after slice 001.
- `node bin/harness-change-validate.js --repo-root . --change worktree-work-promote --inventory --json`: no errors/warnings after slice 001.
- `git diff --check -- lib/change/js-policy.js lib/change/policy.py schemas/change-workspace.schema.json lib/change/validator.js tests/test-change-tools.js`: passed after slice 001.
- `node tests/run-tests.js --change-tools`: passed after slice 002.
- `node bin/harness-change-validate.js --repo-root . --change worktree-work-promote --strict-layout`: ready, 0 errors, 0 warnings after slice 002.
- `git diff --check -- lib/change/root-resolution.js lib/change/doc-tool.js lib/change/validator.js tests/test-change-tools.js`: passed after slice 002.
- `node tests/run-tests.js --change-tools`: passed after slice 003.
- `node bin/harness-change-validate.js --repo-root . --change worktree-work-promote --strict-layout`: ready, 0 errors, 0 warnings after slice 003.
- `git diff --check -- lib/change/execution-map.js lib/change/doc-tool.js lib/change/js-policy.js tests/test-change-tools.js`: passed after slice 003.
- `node tests/run-tests.js --change-tools`: passed after slice 004.
- `node bin/harness-change-validate.js --repo-root . --change worktree-work-promote --strict-layout`: ready, 0 errors, 0 warnings after slice 004.
- `node bin/harness-change-doc.js --repo-root . index worktree-work-promote --json`: slice 004 review/task artifacts indexed; diagnostics empty.
- `git diff --check -- lib/change/execution-map.js lib/change/validator.js tests/test-change-tools.js`: passed after slice 004.
- `python3 -m py_compile lib/change/root_resolution.py lib/change/execution_map.py lib/change/harness_change_doc.py lib/change/harness_change_validate.py lib/change/policy.py`: passed after slice 005.
- `node tests/run-tests.js --change-tools`: passed after slice 005 Python parity and review-loop conflict-output correction.
- `node bin/harness-change-validate.js --repo-root . --change worktree-work-promote --strict-layout`: ready, 0 errors, 0 warnings after slice 005.
- `node bin/harness-change-doc.js --repo-root . index worktree-work-promote --json`: diagnostics empty before slice 005 review artifact updates.
- `git diff --check -- lib/change/root_resolution.py lib/change/execution_map.py lib/change/harness_change_doc.py lib/change/harness_change_validate.py lib/change/policy.py tests/test-change-tools.js`: passed after slice 005.
- `node tests/run-tests.js --skills --subagents`: passed after slice 006.
- `node tests/run-tests.js --change-tools --skills --subagents`: passed after slice 006.
- `node bin/harness-change-validate.js --repo-root . --change worktree-work-promote --strict-layout`: ready, 0 errors, 0 warnings after slice 006.
- `git diff --check -- commands/harness/workflow.md commands/harness/handoff.md hooks/intents/session-bootstrap.md hooks/intents/active-change-guard.md skills/change/change-workspace-operator/SKILL.md skills/change/change-planner/SKILL.md skills/operations/handoff-checkpoint/SKILL.md tests/test-skills.js tests/test-subagents-hooks.js`: passed after slice 006.
- `npm test`: passed after slice 007.
- `node bin/harness.js manifest --json`: `ok: true`, errors and warnings empty after slice 007.
- `node tests/run-tests.js --projection`: passed after slice 007 source-hash verification coverage.
- `node bin/harness-project.js --target . --clients codex --content rules,templates,skills,subagents,hooks --verify --json`: detected stale copied/rendered projected assets after the source-hash verifier fix.
- `node bin/harness-project.js --target . --clients codex --content rules,templates,skills,subagents,hooks --conflict overwrite --json`: refreshed Codex self-hosting projection after slice 007.
- `node bin/harness-project.js --target . --clients codex --content rules,templates,skills,subagents,hooks --verify --json`: `ok: true` after projection refresh.
- `git diff --check`: passed after slice 007.
- `node bin/harness-change-validate.js --repo-root . --change worktree-work-promote --strict-layout`: ready, 0 errors, 0 warnings after slice 007.
