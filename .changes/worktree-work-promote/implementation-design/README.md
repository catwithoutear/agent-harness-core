---
artifact: implementation-design-index
status: reviewed
tags: [design, implementation]
description: "Implementation design pack for shared-state multi-worktree execution."
---
# Implementation Design

## Purpose

This pack closes the `NOT_READY` findings from
`reviews/draft-r01.md`. It defines a V1 `shared-state` model for coordinating
multiple code worktrees from one canonical `.changes/<change>` workspace.

The implementation is a cross-cutting harness workflow change. It touches
change workspace tooling, validators, workflow prompts, skills, schemas, and
tests. No product-specific worktree layout, branch naming scheme, or target
repository fact belongs in this design.

## Readiness Trace

```text
linked worktree failure mode
  -> canonical state root and execution roots
  -> change-workspace tooling and validator modules
  -> root resolution, execution map, and validation steps
  -> change-tool tests, skill/prompt tests, manifest/projection checks
```

Stable anchors use `relative/path:Symbol` for code and
`relative/path` plus heading names for Markdown assets.

## Detailed Design Index

| File | Purpose | Required content |
|---|---|---|
| `01-problem.md` | Problem, goals, and boundaries | Accepted V1 scope, source facts, rejected alternatives |
| `02-code-topology.md` | Code topology | Subsystems, modules, source anchors, dependency rules |
| `03-class-design.md` | Interface design | Root context and execution-map structures, command responsibilities |
| `04-runtime-flow.md` | Runtime flow | Resolve, assign, validate, state-transition, failure flows |
| `05-error-model.md` | Error model | Root ambiguity, duplicate state, parse failures, idempotency |
| `06-implementation-plan.md` | Implementation plan | Ordered slices, validation, rollback, traceability |
| `07-constraints.md` | Constraints and self check | Scope limits, anti-pattern checks, readiness self-review |

## Design Decisions

| Decision | Rationale | Finding closed |
|---|---|---|
| V1 supports only `shared-state`. | The first implementation should remove accidental duplicate `.changes` state before adding local-state forking semantics. | WWP-R01-F05 |
| Add a top-level `execution-map.md` artifact. | Slice scheduling spans multiple task-slice files, so it needs one map that can be validated independently. | WWP-R01-F01 |
| `execution-map.md` owns assignment, topology, current execution status, owner, and last evidence pointer. | One authoritative scheduling surface prevents task-slice drift. | WWP-R01-F01 |
| Task slices own implementation steps, validation details, review packet, rollback, and handoff evidence. | Detailed evidence remains close to the slice being implemented. | WWP-R01-F01 |
| Add explicit root resolution before regulated writes. | Linked worktrees cannot safely infer state roots from cwd alone. | WWP-R01-F02 |
| Model `parallel` and `stacked` topology separately. | Independent sibling work and dependent branch stacks have different merge and validation rules. | WWP-R01-F04 |
| Block duplicate non-explicit state-root candidates before selecting cwd. | The original linked-worktree failure can recur if a local accidental `.changes/<change>` wins precedence. | WWP-SUB-R01-F01 |
| Use one root-flag contract across JS and Python validators. | `--state-root`, legacy `--repo-root`, and `--code-root` must mean the same thing in all change tools. | WWP-SUB-R01-F02 |
| Require Python parity for V1 public behavior. | The repository already has Python mirrors; deferral would make workflow guidance client-dependent. | WWP-SUB-R01-F03 |
| Make worktree paths, `planned`, and stacked dependency-status rules explicit. | These details are required for deterministic validation and task slicing. | WWP-SUB-R01-F05, WWP-SUB-R01-F06, WWP-SUB-R01-F07 |
| Make evidence references change-relative and keep worktree paths local. | Durable evidence should remain portable in canonical `.changes`; worktree paths are machine-local execution coordinates. | Multi-lens review follow-up |

## Minimum Use / N/A Rule

All detail files are material for this change because the design introduces new
state, workflow, failure, and validator behavior.

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

- Root resolution precedence and unresolved-state behavior are explicit.
- `execution-map.md` has an ownership contract, columns, statuses, and topology
  rules.
- Ready, merged, and blocked slice states require concrete evidence pointers.
- Validator checks distinguish errors from transition warnings.
- JS and Python change-tool behavior either stays in parity or the divergence
  reopens the V1 scope before implementation.
- Worktree paths have deterministic relative-base, realpath, and severity
  rules.
- `Last Evidence` references have deterministic change-relative path and
  Markdown heading rules.
- `planned` can be represented through `assign-slice` without requiring a
  branch/worktree, while non-planned execution states require them.
- Stacked `ready` and `merged` states validate dependency statuses.
- Prompt and skill updates guide agents to the tool contract without adding a
  parallel process framework.
