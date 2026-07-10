---
artifact: implementation-design-index
status: reviewed
tags: [design, implementation, review-coverage, review-verification]
description: "Detailed implementation design for the review coverage contract."
---
# Implementation Design

## Purpose

This pack makes the frozen review-coverage contract executable without creating
a parallel review workflow. It covers the packet owner, a small read-only
fingerprint/seal helper, reviewer and verifier authority, existing client
projection, and the tests that distinguish static contract checks from a
fresh-agent evaluation.

Use `Subsystem` for capability or runtime boundaries. Use `Module` for code
organization boundaries. A small task with one subsystem may fold the subsystem
notes into the module topology, but larger or cross-service work should keep
both explicit.

## Readiness Trace

Before implementation starts, the pack should show this trace for every
material design item:

```text
frozen review-coverage requirements and design
  -> canonical packet and fingerprint decision
  -> review skill, role, workflow, and projection boundaries
  -> source anchors and ordered implementation slices
  -> static, helper, projection, fixture, and forward-evaluation evidence
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

## Selected Implementation Decisions

| Decision | Rationale | Primary owner |
|---|---|---|
| Keep the protocol in the existing `review-packet-gate` skill and workflow chain. | The frozen design rejects a parallel workflow; packets and routing already have clear owners. | `skills/review/review-packet-gate/SKILL.md` |
| Add `skills/review/review-packet-gate/scripts/review-packet-digest.mjs`. | A small Node 20 helper can reproduce Git-worktree or explicit artifact-set target fingerprints and seal packet bytes without a new package CLI, external hashing tool, or ledger parser. | review packet skill |
| Add one read-only `review-verifier` specialist role only for deep inventory and comparison. | It separates independent coverage authority from correctness review without duplicating the reviewer or coordinator. | `agents/roles/review-verifier.md` |
| Reuse manifest validation and `renderAgent`; do not modify projection implementation. | Existing generic registration and four-client rendering already project canonical role bodies. | `harness.manifest.json`, `lib/project/projector.js:renderAgent` |
| Use Markdown contracts and deterministic fixtures, not a V1 ledger parser or serialized schema. | The task needs human-readable agent packets; automated checks must not overclaim semantic omission detection. | skill, roles, tests |

## Scope And Readiness

All seven detail documents are material: this change has a cross-asset packet
contract, a read-only helper interface, two phase-dependent flows, stale and
unavailable-input failure paths, a new projected role, and behavior that needs
both deterministic and fresh-agent evidence.

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

The pack was reviewed `READY` in `reviews/implementation-design-r04.md`. It is
the required topology boundary for task slicing; it does not itself authorize
source edits.
