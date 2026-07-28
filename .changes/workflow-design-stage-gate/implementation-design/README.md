---
artifact: implementation-design-index
status: draft
tags: [design, implementation]
description: "Implementation topology for workflow stage gates"
---
# Implementation Design

## Upstream Design

- Solution: `../design.md`
- Owner decision: `../decisions/DR-002-stage-gate-simplification.md`
- Prior review: `../reviews/implementation-design-r01.md` identified and
  rejected the overcomplicated mechanical gate-reference direction.
- Current solution review: `../reviews/solution-design-r03.md`, `READY`.
- Current requirement: independently review this pack before task slicing.

## Purpose

Translate the accepted phase-ordering design into bounded changes to Core
workflow guidance and its published metadata, tests, and projections. The pack
does not redesign change-workspace mechanics, migration, review-verifier V2, or
task execution.

One capability is being changed: workflow coordination. Its source is spread
across skills, commands, rules, templates, user guidance, tests, and client
projections. Existing document writers and validators remain unchanged.

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
- Independent multi-lens review must return `READY` before task slices are
  created.
