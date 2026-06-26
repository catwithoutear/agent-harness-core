---
artifact: implementation-design-index
status: draft
tags: [design, implementation]
description: "Detailed implementation design index."
---

# Implementation Design

## Purpose

This directory turns the selected design into code topology constraints for
implementation agents.

Use `Subsystem` for capability or runtime boundaries. Use `Module` for code
organization boundaries. A small task with one subsystem may fold the subsystem
notes into the module topology, but larger or cross-service work should keep
both explicit.

## Detailed Design Index

| File | Purpose | Required content |
|---|---|---|
| `01-problem.md` | Problem, goals, and boundaries | Goals, non-goals, boundary conditions, source artifacts |
| `02-code-topology.md` | Code topology | Subsystem topology, module topology, dependency rules |
| `03-class-design.md` | Class and interface design | Class diagram, responsibility table, interface drafts |
| `04-runtime-flow.md` | Runtime flow | Object lifecycle, main sequence, failure and rollback sequence, state transitions |
| `05-error-model.md` | Error model | Error categories, retry, rollback, idempotency, observability |
| `06-implementation-plan.md` | Implementation plan | Verifiable steps, traceability, coding guardrails |
| `07-constraints.md` | Constraints and self check | Constraints, anti-pattern checks, readiness self-review |

## Minimum Use / N/A Rule

Use this pack only when implementation-design is required by the workflow
trigger rule. The tool creates all standard file paths for stable indexing, but
that does not make every detail document substantively required.

- Default core documents: `01-problem.md`, `02-code-topology.md`, and
  `06-implementation-plan.md`.
- Fill `03-class-design.md` when class, interface, or ownership structure
  affects implementation.
- Fill `04-runtime-flow.md` when lifecycle, sequence, state, failure, rollback,
  concurrency, migration, or idempotency behavior matters.
- Fill `05-error-model.md` when error categories, retry, rollback,
  idempotency, or observability are material to the change.
- Fill `07-constraints.md` before readiness or freeze. Empty sections should be
  marked `N/A` with a short reason, not left blank.
- For localized work below the trigger threshold, keep a no-design reason in
  the task plan instead of creating this pack.

## Readiness Gate

- Code topology identifies subsystem and module boundaries when they differ.
- File/class mappings are concrete enough to guide implementation.
- Runtime, failure, rollback, and validation paths are documented.
- Each implementation step has traceability to a requirement or design item.
