---
artifact: task-slice
status: reviewed
tags: [implementation, worktree-work-promote, verification]
description: "Slice 7: run projection and final repository verification after source assets change."
---
# Slice: projection-final-verification

## Objective

Run final projection and repository verification after all source behavior and
workflow asset slices are complete.

## Scope

- Source design: `implementation-design/06-implementation-plan.md` step 7 and
  repository `AGENTS.md` verification requirements.
- Goal: prove the complete change is internally consistent, projected runtime
  assets are in sync, and no required verification remains unrun.
- Non-goals: adding new behavior, widening scope, or hand-editing projected
  runtime files.
- Scope: final test suite, manifest generation, Codex projection verification,
  optional projection refresh through the project tool if verify detects drift,
  final review packet, and handoff evidence.
- Subsystem: final package verification.
- Module: projector/test suite.
- Changed surfaces: `tests/test-projection.js` only if needed,
  `harness.manifest.json` only if new source assets require manifest changes,
  projected runtime files only through `node bin/harness-project.js` when
  verification proves they need regeneration.
- Prerequisites: slices 001-006 complete and reviewed.

## Steps

- [x] Run the full verification set from `AGENTS.md`.
- [x] Add stale source-hash coverage after projected runtime drift showed the
      prior verifier could accept an old target hash.
- [x] Projection verify detected stale copied/rendered runtime assets after the
      verifier fix.
- [x] Refresh Codex self-hosting projection through `harness-project` and rerun
      projection verification.
- [x] Confirm `harness.manifest.json` changes are present only when source asset
      additions/renames require them.
- [x] Run `git diff --check` after projection/test changes.
- [x] Prepare final review packet with changed files, command output, residual
      risks, and rollback notes.

## Validation

- [x] `npm test`
- [x] `node bin/harness.js manifest --json`
- [x] `node bin/harness-project.js --target . --clients codex --content rules,templates,skills,subagents,hooks --verify --json`
- [x] `git diff --check`
- [x] `node bin/harness-change-validate.js --repo-root . --change worktree-work-promote --strict-layout`

Evidence:

- `npm test`: passed.
- `node bin/harness.js manifest --json`: `ok: true`, errors and warnings empty.
- `node tests/run-tests.js --projection`: passed after adding stale source-hash coverage.
- `node bin/harness-project.js --target . --clients codex --content rules,templates,skills,subagents,hooks --verify --json`: failed as expected after the verifier fix while stale projected assets remained; reported source-hash mismatches for copied/rendered assets.
- `node bin/harness-project.js --target . --clients codex --content rules,templates,skills,subagents,hooks --conflict overwrite --json`: refreshed projected runtime assets through the project tool.
- `node bin/harness-project.js --target . --clients codex --content rules,templates,skills,subagents,hooks --verify --json`: `ok: true` after projection refresh.
- `git diff --check`: passed.
- `node bin/harness-change-validate.js --repo-root . --change worktree-work-promote --strict-layout`: ready, 0 errors, 0 warnings.

## Review

- Review packet: full verification output, manifest/projection status, final
  diff summary, and unresolved risk list if any.
- Review owner: reviewer for final package readiness.
- Review round: `reviews/slice-007-r01.md`
- Gate: `READY`; implementation stack is ready for handoff.

## Rollback

- Revert source changes and any tool-generated projection updates together. No
  destructive git operations are part of this slice.

## Open Decisions

- None
