---
artifact: design
status: draft
tags: [design, workflow, validation, compatibility]
description: "Solution design for explicit proposal, design, implementation-design, and task-slicing gates."
---

# Design

## Purpose

This change makes one workflow rule explicit:

```text
observe
  -> proposal and challenge
  -> solution design and review
  -> implementation-design assessment
  -> implementation-design and review, when required
  -> task slicing and task-set review
  -> implementation
```

`design.md` decides what the solution must do. An
`implementation-design/` pack, when required, maps that accepted solution to
code ownership, dependencies, runtime flow, failure handling, implementation
order, and tests. Task slices are derived only after the last required design
artifact is accepted.

This is a generic Core workflow contract. It does not change
`review-verifier-v2`, add product-specific behavior, or require every small
change to create every artifact.

## Detailed Design Index

| Artifact or decision | Owns | Must not own |
|---|---|---|
| `research.md` | Verified current facts, constraints, and unknowns. | A selected solution. |
| `proposal.md` | Problem, alternatives, selected direction, non-goals, and risks. | Code topology or task decomposition. |
| Proposal challenge | Pressure-test direction and assumptions. | Silent proposal rewriting. |
| `design.md` | Behavior, boundaries, compatibility, failure semantics, and validation intent. | File-by-file implementation instructions. |
| Design review | Decide whether the solution contract is ready. | Implementation approval. |
| Implementation-design assessment | Apply the existing trigger rule to the accepted design. | Reopen unresolved solution choices. |
| `implementation-design/` | Map the accepted design to modules, files, interfaces, sequencing, and test points. | Change the accepted solution without returning to design review. |
| Task slices | Bounded implementation units derived from accepted upstream artifacts. | Discover architecture or settle design. |

File or directory presence is never readiness evidence by itself.

## Paths Through The Workflow

### Fast Path

Use for low-risk wording, formatting, or similarly local work where no
behavior, interface, lifecycle, dependency, migration, or failure contract
changes.

Required evidence:

1. Current source was observed.
2. The narrow edit and validation are stated.
3. The result is verified.

No proposal, design, implementation-design pack, or task set is required.

### Compact Path

Use for bounded implementation work whose solution is already clear and does
not meet the implementation-design trigger.

Before implementation, the plan or task slice records:

- the bounded goal and affected source;
- why solution design and an implementation-design pack are unnecessary;
- validation;
- rollback.

Review this lightweight plan when its risk warrants review. Do not require a
separate review artifact for routine localized work.

Uncertainty about behavior, compatibility, ownership, lifecycle, migration, or
dependency order disqualifies the compact path.

### Design Path

Use when the solution itself needs to be selected or specified.

1. Observe current behavior and constraints.
2. Draft and challenge the proposal.
3. Write and review the solution design.
4. Apply the implementation-design trigger only after the design review is
   ready.
5. If the trigger applies, create, populate, and review the pack.
6. Create and review task slices from the accepted design or pack.

Any changed solution decision invalidates downstream implementation-design and
task evidence that depends on it.

## Review And Transition Rules

The coordinator reads the current upstream artifact and its latest relevant
review before moving to the next phase. A downstream document names the source
design or review it follows when that improves traceability, but no
machine-readable gate-reference protocol is required.

Use the shared decisions `READY`, `READY_WITH_NOTES`, `NOT_READY`,
`NEEDS_USER_DECISION`, and `NEEDS_COUNCIL`.

`READY_WITH_NOTES` permits a transition only when each note is non-blocking,
owned, carried forward, and unable to change the downstream contract.

If an upstream artifact changes materially, the coordinator or reviewer
returns the work to that phase. This is a semantic judgment: a file hash can
show that bytes differ, but it cannot decide whether the design remains valid.

Writer commands create artifact structure. Validators check structure and
repository policy. Neither substitutes for reading the documents or reviewing
their content.

## Implementation-Design Trigger

Assess the trigger after the solution-design gate.

A pack is required when the accepted design:

- crosses subsystem boundaries;
- changes two or more modules with dependency-order risk;
- introduces lifecycle, state, concurrency, recovery, rollback, migration, or
  idempotency behavior;
- needs explicit ownership, dependency bans, source mapping, or test-point
  mapping to prevent implementation guesswork.

The assessment result is:

| Result | Next step |
|---|---|
| `required` | Create and populate the standard pack, review it, then slice tasks. |
| `not-required` | Record the reason in the plan or task slice, then slice directly from the accepted design. |

Creating an empty pack does not satisfy the trigger. When a pack is required,
task slicing is blocked until the populated pack review is ready.

## Task-Slicing Gate

Every slice states:

- source design, pack, requirement, or explicit no-design reason;
- goal and non-goals;
- owned source surface;
- dependencies and ordering;
- acceptance checks;
- rollback;
- review boundary.

Before implementation dispatch, a task-set review confirms:

- every slice is indexed;
- dependencies are acyclic and satisfiable;
- ownership does not conflict;
- validation covers the accepted design;
- no slice relies on unresolved upstream design.

When a slice, dependency, source design, or validation changes materially,
review the affected task set again.

## Workspace Compatibility

Legacy workspaces remain valid on their historical path. They migrate only when
they need structured-only artifacts, using the existing controlled migration
workflow.

This change's migration is complete and recorded in
`decisions/DR-001-migration-provenance.md` and `reviews/migration-r01.md`.
Migration implementation, bootstrap history, transaction behavior, and
Node/Python migration parity are not part of the workflow-stage implementation.

## Compatibility

| Existing state | Required behavior |
|---|---|
| Low-risk work | Fast path remains available. |
| Localized work with a settled solution | Compact path records why design and pack are unnecessary. |
| Legacy change needing no structured artifact | Continue on its historical path. |
| Legacy change needing structured artifacts | Use the existing migration workflow, then continue normally. |
| Structured change before slicing | Apply the assessment prospectively and preserve valid prior work. |
| Existing populated pack | Preserve it; review it when reopening or deriving new slices. |

## Failure Handling

| Failure | Result |
|---|---|
| Proposal or design has unresolved blocker | Stop before trigger assessment. |
| Trigger assessment is missing or no longer matches the current design | Reassess before task slicing. |
| Required pack is missing, empty, or not ready | Stop before task slicing. |
| Task-set review is incomplete or no longer matches the current slices | Review the affected task set before implementation. |
| Upstream artifact changed materially | Return to that phase and review the affected downstream assumptions. |
| Agent is unsure whether a path is fast, compact, or design | Use the safer next design step or request a focused review; do not invent mechanical state. |

## Validation

Future implementation and review must cover:

- fast, compact, and design-path classification;
- guidance that topology assessment follows a ready solution design;
- examples where an implementation-design pack is needed and where it is not;
- guidance that an empty or unreviewed required pack cannot lead to slicing;
- task-set ownership, dependency, and validation coverage;
- legacy workspaces remaining valid without migration;
- existing artifact writers and validators remaining structural rather than
  semantic authorities;
- paired README/README_CN guidance;
- projected skills, commands, and rules carrying the same phase order.

## Risks

| Risk | Mitigation |
|---|---|
| Small work gains unnecessary ceremony. | Keep the fast and compact paths explicit. |
| File presence is mistaken for approval. | State that agents must read and review content before transitioning. |
| Implementation design reopens solution choices. | Make accepted design its input; changed choices return to design review. |
| Task slices hide unresolved architecture. | Block slicing until the required upstream artifact is ready. |
| Guidance drifts across entry points. | Update canonical skills, commands, rules, paired docs, and projection tests together. |
| Mechanical enforcement grows into a second workflow system. | Keep semantic readiness with the coordinator and reviewer. |

## Current Assessment

The workflow-stage implementation crosses shared skills, commands, rules,
templates, documentation, projection behavior, and tests. Its
implementation-design trigger result remains `required`.

The implementation must not add a gate protocol, phase state, command, schema
contract, validator semantics, or migration behavior. The next step is to
review this simplified solution design, update the implementation-design pack
to match it, and review that pack before task slicing.
