---
artifact: decision-record
status: frozen
tags: [decision]
description: "Remove mechanical gate references and keep the workflow contract readable"
---
# DR: stage-gate-simplification

## Context

The implementation-design review showed that the five-field gate-reference
idea did not serve the original problem. It duplicated information, could not
prove that reviewed inputs remained semantically current, and would require a
new review protocol, compatibility version, mirrored parsers, and diagnostics.

The original problem is narrower: agents must understand the distinct jobs and
ordering of proposal, solution design, implementation design, task slicing, and
implementation.

## Decision

Remove the five-field mechanical gate-reference design.

Core will express the phase order and transition conditions in canonical
workflow skills, commands, rules, templates, and user guidance. The active AI
coordinator and reviewer read the upstream artifacts and decide whether they
remain suitable for the next phase.

Artifacts may name the upstream design or review for traceability, but no
machine-readable digest protocol, phase state, version marker, registry, or new
command is introduced. Validators continue to validate artifact structure; they
do not claim semantic readiness or transitive freshness.

## Alternatives Considered

- Build a complete reviewed-input and digest protocol: rejected because it
  creates a second workflow system to solve a reading and sequencing problem.
- Keep two mechanical fields (`review_path` and `review_sha256`): rejected as a
  required contract because the hash still cannot prove that the reviewed
  design remains current. A plain evidence pointer is enough for traceability.
- Rely on file presence: rejected because an empty or stale artifact is not a
  ready design.

## Consequences

- Implementation scope becomes primarily workflow guidance, artifact wording,
  focused tests, and projection verification.
- Node/Python migration, writers, validators, schema, and policy are not changed
  for this feature unless a later independently justified defect requires it.
- If an upstream design changes materially, the coordinator returns to that
  phase and obtains a new review. This is a semantic review responsibility.
- Small work retains fast and compact paths without mandatory empty artifacts.
