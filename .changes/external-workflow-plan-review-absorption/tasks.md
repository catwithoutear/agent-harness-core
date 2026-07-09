---
artifact: tasks
status: reviewed
tags: [workflow, review, validation, external-workflow]
description: "Draft tasks for workflow, planning, and review absorption."
---

# Tasks

## 1. Implementation

- [x] Record non-UI scope, source evidence, accepted candidates, deferred
      candidates, and explicit exclusions.
- [x] Review the draft with `multi-lens-design-review` for boundary,
      duplication, implementation-readiness, and validation gaps.
- [x] Decide whether Track E belongs in the first implementation wave or a
      follow-up verification change.
- [x] Freeze the accepted tracks and update this workspace status.

### Task Slice Index

First-wave scope is frozen to Tracks A-D. Slice implementation by existing asset
owner, not by external source skill. The slice documents have been created
under `tasks/`; their checkboxes remain open until implementation and review
complete.

- [x] Planning-artifact challenge review of the current `grill-with-docs` implementation
      slice: `tasks/slice-001-plan-challenge-gate.md`.
- [x] Scope packet enhancement for requirements/design refinement:
      `tasks/slice-002-scope-packet.md`.
- [x] Approach-selection enhancement for source research and alternatives:
      `tasks/slice-003-approach-selection.md`.
- [x] Review-gate completeness enhancement:
      `tasks/slice-004-review-gate-completeness.md`.
- [x] Track E evidence-discipline follow-up is deferred by `decisions/DR-001-track-scope.md`.

## 2. Validation

- [x] `npm test`
- [x] `node bin/harness.js manifest --json`
- [x] `node bin/harness-project.js --target . --clients codex --content rules,templates,skills,subagents,hooks --verify --json`
- [x] `node bin/harness-change-validate.js --repo-root . --change external-workflow-plan-review-absorption`
- [x] `git diff --check`
