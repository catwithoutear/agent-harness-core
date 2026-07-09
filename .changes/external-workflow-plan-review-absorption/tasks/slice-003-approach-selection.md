---
artifact: task-slice
status: reviewed
tags: [implementation, external-workflow]
description: "Slice 3: add approach-selection alternatives guidance."
---
# Slice: approach-selection

## Objective

Add approach-selection guidance that compares viable alternatives before an
implementation direction is frozen.

## Scope

- Source design: `proposal.md` Track B; `design.md` Track B; `specs/workflow-plan-review.md` "Approach selection compares alternatives"; `decisions/DR-001-track-scope.md`.
- Goal: planning guidance requires success criteria, source inspection, status-quo assessment, alternatives, tradeoffs, and a recommended approach when more than one credible path exists.
- Non-goals: generic external research mandates for internal-only work, product-specific GitLens conventions, frontend/UI flows, planning-artifact challenge, or implementation review.
- Scope: source-research and design-refinement guidance for choosing an approach.
- Subsystem: source-backed planning.
- Module: architecture scouting and design refinement guidance.
- Changed surfaces: `skills/change/architecture-scout/SKILL.md`, `skills/knowledge/design-doc-refiner/SKILL.md`, and focused assertions in `tests/test-skills.js` if needed.
- Prerequisites: slice 002 should land first if it changes the same `design-doc-refiner` sections.
- Implementation-design: no pack required; see `decisions/DR-001-track-scope.md`.

## Steps

- [x] Add approach-selection expectations to `design-doc-refiner` without turning it into a planning-artifact challenge skill.
- [x] Add architecture-scout handoff guidance for source-backed status quo, reusable patterns, unknowns, and risks.
- [x] Clarify that external research is conditional, not default, for internal repository behavior.
- [x] Add or adjust focused tests only for stable guidance that should not regress.

## Validation

- [x] `npm test`
- [x] `node bin/harness.js manifest --json`
- [x] `node bin/harness-project.js --target . --clients codex --content rules,templates,skills,subagents,hooks --verify --json`
- [x] `git diff --check`

## Review

- Review packet: changed skill sections, explanation of how overlap with `grill-with-docs` is avoided, and validation output.
- Review owner: planning reviewer for approach-selection clarity and reuse.
- Review round: `reviews/slice-003-r01.md`.
- Gate: `READY_WITH_NOTES`.

## Rollback

- Revert the skill guidance and related tests. No schema or projected-state migration is planned.

## Open Decisions

- None.
