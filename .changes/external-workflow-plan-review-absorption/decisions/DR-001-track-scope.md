---
artifact: decision-record
status: frozen
tags: [decision]
description: "Freeze first-wave tracks A-D and defer Track E."
---
# DR: track-scope

## Context

`reviews/draft-r01.md` reviewed the non-UI workflow, planning, and review
absorption draft as `READY_WITH_NOTES`. The review required three convergence
actions before task slicing:

- decide whether Track E belongs in the first implementation wave;
- fix the ambiguous task numbering;
- record the implementation-design pack decision.

## Decision

Freeze Tracks A-D as the first implementation wave:

- Track A: Scope Packet Before Approach Selection.
- Track B: Approach Selection With Alternatives.
- Track C: Planning Artifact Challenge Gate.
- Track D: Review Gate Completeness.

Defer Track E, Evidence Discipline For Improvement Claims, to a follow-up
verification-focused change.

Do not create an implementation-design pack for first-wave task slicing. The
accepted tracks can be implemented as independent skill, role, and documentation
slices with local manifest or test support. They do not introduce lifecycle,
state transition, concurrency, failure-recovery, migration, idempotency, or
cross-module dependency-order semantics.

## Alternatives Considered

- Include Track E in the first wave. Rejected for now because it shifts the
  first wave from workflow, planning, and review contracts toward a broader
  verification-policy change.
- Create a full implementation-design pack before slicing. Rejected for now
  because the frozen tracks can be sliced independently and the workflow trigger
  conditions are not met.

## Consequences

- Implementation slicing can proceed for Tracks A-D.
- Track E remains visible as deferred scope and must not become a first-wave
  task without an explicit scope decision.
- If a later implementation slice combines multiple tracks or creates
  dependency-order risk across skills, roles, manifest, and tests, the
  implementation-design pack decision must be reopened.
