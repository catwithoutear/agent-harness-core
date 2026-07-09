---
artifact: design
status: draft
tags: [design, workflow, review, external-workflow]
description: "Draft design for non-UI workflow, planning, and review absorption."
---

# Design

## Boundary

This change affects generic harness workflow assets only. It should not add new
frontend/UI skills, new third-party UI assets, project-specific issue tracker
automation, or client-specific command conventions.

## Detailed Design Index

| Track | Primary assets | Change shape |
|---|---|---|
| A: scope packet | `skills/knowledge/design-doc-refiner/SKILL.md`, `skills/change/change-workspace-operator/SKILL.md`, `.changes` templates if needed | Add requirements-scoping checklist and confidence fields. |
| B: approach selection | `skills/change/architecture-scout/SKILL.md`, `skills/knowledge/design-doc-refiner/SKILL.md` | Add status-quo challenge, alternatives, and research boundary. |
| C: planning-artifact challenge | `skills/workflow/grill-with-docs/SKILL.md`, `harness.manifest.json`, `tests/test-skills.js` | Existing in-progress slice; review and keep only if tests and projection pass. |
| D: review completeness | `skills/review/review-packet-gate/SKILL.md`, `skills/review/multi-lens-design-review/SKILL.md`, `agents/roles/planning-reviewer.md`, `agents/roles/reviewer.md` | Add scope-alignment, consumer completeness, validation-gap, and residual-risk checks. |
| E: evidence discipline | `skills/change/verification-first/SKILL.md`, review packet wording | Deferred follow-up; no first-wave edits. |

## Source Anchors

| Concern | Source anchor |
|---|---|
| Workflow loop and review packet vocabulary | `skills/workflow/workflow-control/SKILL.md` |
| Change workspace operations | `skills/change/change-workspace-operator/SKILL.md` |
| Design refinement | `skills/knowledge/design-doc-refiner/SKILL.md` |
| Planning-artifact challenge current slice | `skills/workflow/grill-with-docs/SKILL.md` |
| Review gates | `skills/review/review-packet-gate/SKILL.md`, `skills/review/multi-lens-design-review/SKILL.md` |
| Deferred evidence discipline | `skills/change/verification-first/SKILL.md` |
| Projection routes | `harness.manifest.json` |
| Regression tests | `tests/test-skills.js`, `tests/test-subagents-hooks.js` |

## Routing Rules

- Use `design-doc-refiner` when turning rough scope into implementation-ready
  requirements or design.
- Use `architecture-scout` when the code landscape or status quo needs source
  research before planning.
- Use `grill-with-docs` when a concrete plan needs challenge before coding.
- Use `multi-lens-design-review` for design/readiness review before freeze.
- Use `review-packet-gate` for implementation readiness and evidence gates.
- Use `verification-first` only if Track E is reopened or handled in the
  follow-up verification change.

## Review Gates

Before implementation, reviewers should decide:

| Question | Blocks freeze? |
|---|---|
| Are frontend/UI-related candidates fully excluded from this change? | Yes |
| Does each accepted track extend an existing owner instead of duplicating one? | Yes |
| Are tracker-specific commands deferred or abstracted? | Yes |
| Does Track C's current implementation remain consistent with this draft? | Yes |
| Is Track E explicitly deferred? | Yes |

## Implementation-Design Trigger Assessment

Do not create an implementation-design pack for first-wave task slicing. The
accepted tracks can be sliced as independent skill, role, and documentation
updates with local manifest or test support. They do not introduce lifecycle,
state transition, concurrency, failure-recovery, migration, idempotency, or
cross-module dependency-order semantics.

Re-evaluate this decision if a later slice combines multiple tracks into one
cross-asset implementation or introduces dependency bans, file ownership rules,
or test seam mapping that agents could otherwise improvise.
