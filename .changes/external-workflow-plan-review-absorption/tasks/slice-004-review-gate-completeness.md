---
artifact: task-slice
status: reviewed
tags: [implementation, external-workflow]
description: "Slice 4: add review completeness and validation-gap checks."
---
# Slice: review-gate-completeness

## Objective

Strengthen review gates so implementation reviews check scope alignment,
consumer completeness, validation gaps, and residual risk in addition to
correctness findings.

## Scope

- Source design: `proposal.md` Track D; `design.md` Track D; `specs/workflow-plan-review.md` "Review gates include completeness and validation gaps"; `decisions/DR-001-track-scope.md`.
- Goal: review packets and reviewer roles make completeness checks explicit for changed contracts, consumers, validation evidence, and accepted residual risk.
- Non-goals: frontend/UI review, accessibility review, live runtime inspection, tracker automation, Track E verification policy, or new reviewer roles.
- Scope: review skill and role prompt guidance with focused projection/test coverage.
- Subsystem: review readiness gates.
- Module: review-packet contract, multi-lens design review, and reviewer role instructions.
- Changed surfaces: `skills/review/review-packet-gate/SKILL.md`, `skills/review/multi-lens-design-review/SKILL.md`, `agents/roles/planning-reviewer.md`, `agents/roles/reviewer.md`, `tests/test-skills.js`, and `tests/test-subagents-hooks.js` if role assertions change.
- Prerequisites: slices 001-003 complete or explicitly skipped; this slice depends on the accepted planning contracts it reviews against.
- Implementation-design: no pack required; see `decisions/DR-001-track-scope.md`.

## Steps

- [x] Update `review-packet-gate` to require scope, intended behavior, changed artifacts, validation, known residual risks, and completeness evidence.
- [x] Update `multi-lens-design-review` only where design-readiness review should preserve accepted deferrals and validation gaps.
- [x] Update reviewer roles to distinguish correctness findings from completeness and validation-gap findings.
- [x] Keep role authority read-only and avoid creating new reviewer roles.
- [x] Add or adjust focused skill and subagent tests for stable behavior.

## Validation

- [x] `npm test`
- [x] `node bin/harness.js manifest --json`
- [x] `node bin/harness-project.js --target . --clients codex --content rules,templates,skills,subagents,hooks --verify --json`
- [x] `git diff --check`

## Review

- Review packet: changed review skill/role sections, tests proving projection or prompt expectations, and validation output.
- Review owner: reviewer plus planning reviewer for review-gate behavior and authority boundaries.
- Review round: `reviews/slice-004-r01.md`.
- Gate: `READY_WITH_NOTES`.

## Rollback

- Revert review skill, role, and test changes. No persisted migration is introduced.

## Open Decisions

- None.
