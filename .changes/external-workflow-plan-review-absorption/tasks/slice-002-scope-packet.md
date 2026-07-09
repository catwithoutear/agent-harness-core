---
artifact: task-slice
status: reviewed
tags: [implementation, external-workflow]
description: "Slice 2: add source-claim and confidence scoping guidance."
---
# Slice: scope-packet

## Objective

Add first-wave scope-packet guidance so rough tasks preserve claim confidence
before approach selection.

## Scope

- Source design: `proposal.md` Track A; `design.md` Track A; `specs/workflow-plan-review.md` "Scope packets preserve claim confidence"; `decisions/DR-001-track-scope.md`.
- Goal: planning artifacts distinguish confirmed, disputed, and unverifiable claims, outcome expectations, code landscape, constraints, and scoping confidence.
- Non-goals: issue tracker automation, GitLens-specific labels or commands, frontend/UI review criteria, approach selection, planning-artifact challenge, or review-gate completeness.
- Scope: guidance updates for requirements/design refinement and change workspace usage.
- Subsystem: change planning and knowledge refinement.
- Module: design refinement and change workspace operation guidance.
- Changed surfaces: `skills/knowledge/design-doc-refiner/SKILL.md`, `skills/change/change-workspace-operator/SKILL.md`, and focused assertions in `tests/test-skills.js` if needed.
- Prerequisites: slice 001 reviewed or explicitly isolated by the coordinator to avoid mixing source diffs.
- Implementation-design: no pack required; see `decisions/DR-001-track-scope.md`.

## Steps

- [x] Add a compact scope-packet expectation to `design-doc-refiner`.
- [x] Add change-workspace guidance for recording source claims, disputed or unverifiable facts, constraints, and confidence in owning artifacts.
- [x] Avoid introducing new templates unless existing guidance cannot express the contract.
- [x] Add or adjust focused skill tests only for stable routing or required wording.

## Validation

- [x] `npm test`
- [x] `node bin/harness.js manifest --json`
- [x] `node bin/harness-project.js --target . --clients codex --content rules,templates,skills,subagents,hooks --verify --json`
- [x] `git diff --check`

## Review

- Review packet: changed skill sections, evidence that no UI/tracker-specific workflow was introduced, and validation output.
- Review owner: planning reviewer for task-scope quality and simplicity.
- Review round: `reviews/slice-002-r01.md`.
- Gate: `READY_WITH_NOTES`.

## Rollback

- Revert the skill guidance and related tests. No schema or persisted workspace migration is planned.

## Open Decisions

- None.
