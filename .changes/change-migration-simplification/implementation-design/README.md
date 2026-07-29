---
artifact: implementation-design-index
status: reviewed
tags: [design, implementation]
description: "Implementation topology for monotonic change migration"
---
# Implementation Design

## Purpose

This directory maps a settled, reviewed solution design into code topology
constraints for implementation agents. It does not choose or revise the
solution. If topology work reveals a changed behavior, compatibility rule, or
other solution decision, return to solution design and review it again.

Use `Subsystem` for capability or runtime boundaries. Use `Module` for code
organization boundaries. A small task with one subsystem may fold the subsystem
notes into the module topology, but larger or cross-service work should keep
both explicit.

## Readiness Trace

Before implementation starts, the pack should show this trace for every
material design item:

```text
requirement or source fact
  -> design decision and rejected alternatives
  -> subsystem or module boundary
  -> source anchor
  -> implementation step
  -> verification plan or phase-appropriate evidence
```

Prefer stable source anchors such as `relative/path:Symbol`. Use line numbers
only as supporting evidence. For symbol-less files such as config, Markdown, or
data fixtures, use `relative/path` plus the smallest stable heading, key, or
field name.

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
trigger rule after the solution-design review is ready. The tool creates all
standard file paths for stable indexing, but that does not make every detail
document substantively required or ready.

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
- Review the populated pack before deriving task slices. Directory presence,
  generated files, and structural validation do not replace that review.

## Readiness Gate

- The upstream solution design and its review are identified and still current.
- Code topology identifies subsystem and module boundaries when they differ.
- File/class mappings are concrete enough to guide implementation.
- Runtime, failure, rollback, and validation paths are documented.
- Each implementation step has traceability to a requirement, source fact, or
  design item.
- Contract surfaces and affected source anchors are explicit, or marked
  `N/A - <reason>`.
- Verification is phase-correct: design documents require a verification plan,
  planned test seam, or available pre-implementation evidence, not executed
  implementation proof.
- Document integrity is checked with available mechanical signals: front matter,
  generated file set, README/index tables, Mermaid fences, links, and validation
  output supplied by the parent agent or tool.
- The latest pack review is ready before `change-planner` derives task slices.
