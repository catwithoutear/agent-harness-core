---
artifact: review-round
status: reviewed
tags: [review, external-workflow]
description: "Multi-lens review of the non-UI workflow, planning, and review absorption draft."
---
# draft Review Round 1

## Decision

`READY_WITH_NOTES`

Tracks A-D are coherent enough to converge toward freeze. The draft is not yet
ready for implementation slicing until the notes below are resolved in the
change workspace.

Recommended scope decision: defer Track E to a follow-up verification-focused
change unless the user explicitly pulls it into this wave.

## Selected Lenses

| Lens | Reason |
|---|---|
| `boundary_contracts` | The user explicitly excluded frontend/UI skills and product-specific workflows. |
| `implementation_readiness` | The draft names multiple source skill and role owners but has not yet sliced implementation. |
| `artifact_chain` | Requirements, research, proposal, design, spec, and tasks must agree before freeze. |
| `verification_observability` | The draft proposes review and planning enhancements that need test and projection evidence after implementation. |

## Findings

| ID | Severity | Resolution |
|---|---|---|
| EWPR-R01-F01 | Should Fix | Track E remains open in `proposal.md` and `design.md`. Before freeze, record either `deferred` or `accepted`; recommendation is `deferred` to keep the first wave focused on planning and review. |
| EWPR-R01-F02 | Should Fix | `tasks.md` has two `## 2.` sections. Move candidate slices under implementation and keep the schema-required validation heading as `## 2. Validation` during convergence. |
| EWPR-R01-F03 | Should Fix | Before implementation slicing, decide whether the accepted scope needs an implementation-design pack. If slices remain independent skill/document edits, record the no-pack reason; if a slice crosses skills, roles, manifest, and tests together, create the pack first. |
| EWPR-R01-F04 | Info | The frontend/UI boundary is consistently expressed as an exclusion in `requirements.md`, `research.md`, `proposal.md`, `design.md`, and `specs/workflow-plan-review.md`. |
| EWPR-R01-F05 | Info | The draft correctly prefers existing harness owners over new runtime skills: `design-doc-refiner`, `architecture-scout`, `grill-with-docs`, `review-packet-gate`, `multi-lens-design-review`, reviewer roles, and `verification-first`. |
| EWPR-R01-F06 | Info | Tracker automation is correctly deferred as a tracker-agnostic future design rather than imported as GitHub-specific core behavior. |

## Evidence

- Reviewed target: `.changes/external-workflow-plan-review-absorption/`.
- Boundary evidence: `requirements.md` non-goals, `research.md` explicit exclusions, `proposal.md` impact boundary, and `design.md` boundary section.
- Implementation-readiness evidence: `design.md` detailed design index and implementation-design trigger assessment.
- Artifact-chain evidence: `tasks.md` draft checklist and candidate implementation slices.
- Validation already run for the draft workspace:
  - `node bin/harness-change-validate.js --repo-root . --change external-workflow-plan-review-absorption --status --json`: pass, 0 errors, 0 warnings.
  - `git diff --check`: pass.

## Required Next Action

- Converge the draft by recording Track E as deferred or accepted.
- Fix the task heading ambiguity.
- Record the implementation-design pack decision before task slicing.
- Then freeze the accepted tracks and produce bounded implementation slices.
