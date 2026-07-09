---
artifact: task-slice
status: reviewed
tags: [implementation, external-workflow]
description: "Slice 1: review and finalize planning-artifact challenge absorption."
---
# Slice: planning-artifact-challenge

## Objective

Review and finalize the existing `grill-with-docs` planning-artifact challenge
absorption slice before starting additional source edits.

## Scope

- Source design: `proposal.md` Track C; `design.md` Track C; `specs/workflow-plan-review.md` "Planning artifact challenge remains evidence-first"; `decisions/DR-001-track-scope.md`.
- Goal: `grill-with-docs` supports an evidence-first challenge pass for drafts, proposals, plans, designs, detailed designs, and selected approaches with assumptions, source-verified claims, pre-mortem, severity, alternatives, and readiness verdict.
- Non-goals: scope packet guidance, approach-selection guidance, review-gate completeness, Track E verification policy, frontend/UI workflows, tracker automation, or new runtime skills.
- Scope: one existing workflow skill plus its manifest trigger metadata and focused skill tests.
- Subsystem: workflow review and planning gates.
- Module: `grill-with-docs` skill routing and behavioral contract.
- Changed surfaces: `skills/workflow/grill-with-docs/SKILL.md`, `harness.manifest.json`, `tests/test-skills.js`.
- Prerequisites: current working tree already has uncommitted Track C source changes; review and close this slice before adding new source edits for slices 002-004.
- Implementation-design: no pack required; see `decisions/DR-001-track-scope.md`.

## Steps

- [x] Review the current `grill-with-docs`, manifest, and test diff against Track C.
- [x] Confirm the skill remains read-only for planning-artifact challenge and does not become formal design readiness review, approach generation, task slicing, or implementation review.
- [x] Confirm manifest triggers route draft, proposal, design, detailed-design, plan, and selected-approach challenge prompts without adding overlapping skills.
- [x] Keep or adjust focused assertions in `tests/test-skills.js`.
- [x] Record the slice review result in `reviews/`.

## Validation

- [x] `npm test`
- [x] `node bin/harness.js manifest --json`
- [x] `node bin/harness-project.js --target . --clients codex --content rules,templates,skills,subagents,hooks --verify --json`
- [x] `git diff --check`

## Review

- Review packet: diff for `grill-with-docs`, manifest trigger metadata, focused test assertions, and validation output.
- Review owner: reviewer for workflow skill behavior and routing.
- Review round: `reviews/slice-001-r01.md`.
- Gate: `READY_WITH_NOTES`.

## Rollback

- Revert `skills/workflow/grill-with-docs/SKILL.md`, `harness.manifest.json`, and `tests/test-skills.js` changes for Track C. No persisted migration is introduced.

## Open Decisions

- None.
