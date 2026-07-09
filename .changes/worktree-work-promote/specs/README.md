---
artifact: specs-index
status: draft
tags: [workflow, worktree-work-promote]
description: "Spec index for worktree-aware workflow execution."
---

# Specs

## Scope

No separate delta spec files are added yet. The implementation-design pack now
settles the V1 behavioral contract for root resolution, execution-map ownership,
evidence references, local worktree path semantics, and validator behavior.

Add separate specs only if implementation exposes a user-facing or external
contract that should be consumed outside the change-tool implementation plan.

## Candidate Future Specs

| Capability | Purpose |
|---|---|
| Root resolution | Define how commands resolve source roots, state roots, active changes, and linked worktree candidates. |
| Execution map validation | Define consistency checks for slice assignment, duplicate state, topology, and evidence pointers. |
| Slice state transitions | Define legal transitions and required evidence for planned, claimed, active, ready, merged, and blocked states. |
| External workflow docs | Extract stable user-facing behavior from the implementation design if command help, README material, or published workflow docs need a separate spec. |
