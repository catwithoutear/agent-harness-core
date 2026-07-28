---
artifact: tasks
status: draft
tags: [workflow, design, validation]
description: "Task boundary for the workflow design-stage gate proposal phase."
---

# Task Slicing Boundary

## 1. Implementation

- [ ] Deferred: do not create Core source task slices until `design.md` resolves
      phase semantics and its design gate is reviewed.

## Prerequisites Before Task Slicing

- The proposal establishes a generic phase model without conflicting with
  lightweight work or legacy changes.
- `design.md` defines artifact inputs/outputs, phase gates, trigger assessment,
  exception handling, and enforcement boundaries.
- A design review confirms that the solution design precedes any required
  implementation-design pack.
- The implementation-design trigger is assessed after the design gate, not
  inferred from the directory layout. If it applies, the pack is populated from
  the accepted design and reviewed to convergence before task slicing; only an
  explicit no-pack decision may bypass that downstream gate.

## Forbidden Before Those Prerequisites

- Do not edit workflow, change-workspace, README, template, validator, command,
  manifest, projection, or test source assets.
- Do not create an implementation-design pack or task slice merely to express
  the phase-model proposal.
- Do not merge this task into `review-verifier-v2` or modify its protocol
  direction.

## 2. Validation

- [x] Index and validate the proposal workspace.
- [x] Challenge the proposal before creating `design.md`.
- [ ] Run multi-lens design review before task slicing.
