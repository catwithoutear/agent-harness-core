---
artifact: implementation-design-detail
status: reviewed
tags: [design, implementation]
description: "Design constraints, anti-pattern checks, and readiness self-review."
---
# Constraints and Self Check

## N/A Usage

Every row below is filled for the current design checkpoint. Runtime evidence
remains planned until implementation exists.

## Constraints

| Constraint | Applies to | Enforcement or review check |
|---|---|---|
| V1 only supports `shared-state`. | Commands, skills, docs, validator | No command or skill should describe `branch-local-state` as implemented. |
| Preserve `--repo-root` compatibility. | CLI commands and tests | Existing tests using `--repo-root` must continue passing. |
| Resolve state root before regulated writes. | `add-*`, `assign-slice`, future writes | Write commands fail when root context is unresolved or conflicting. |
| Duplicate inferred state roots block writes. | Root resolver | A linked worktree's accidental `.changes/<change>` is not selected when another candidate contains the same change. |
| Do not infer from dirty git status. | Prompts, hooks, validators | Prompt/hook tests keep dirty status as candidate-only language. |
| Execution map is scheduling authority. | `execution-map.md`, task slices | Assignment/status fields are not duplicated into task-slice body by commands. |
| Execution map is a registered artifact. | Policy, schema, validator, inventory, status | Strict layout, index, inventory, and status treat `execution-map.md` as first-class. |
| Task slices are evidence authority. | `tasks/slice-*.md` | Gated statuses require change-relative `Last Evidence` pointers instead of embedding logs in the map. |
| Stacked branch operations stay outside change tools. | `topology=stacked` | Skills point to `stacked-branch-workflow`; commands do not rebase or push. |
| Python parity is required for V1. | Python scripts and tests | Public behavior, root flags, schema precedence, status output, and worktree checks are mirrored. |
| Worktree paths have deterministic local semantics. | `assign-slice`, validator | Relative base, absolute persistence, realpath comparison, missing/unreadable/non-git severity, stale-path handoff behavior, and duplicate detection are tested. |
| Evidence references have deterministic semantics. | `assign-slice`, validator | Paths are change-relative, cannot escape the workspace, and optional Markdown heading fragments must resolve. |
| `planned` status is command-compatible. | `assign-slice`, validator | `planned` may omit branch/worktree; non-planned active states require them. |
| Stacked dependency status gates are explicit. | Validator | `ready` requires dependencies ready or merged; `merged` requires dependencies merged. |
| No automatic cleanup of accidental duplicate `.changes`. | Validator | Validator reports duplicate state; cleanup remains manual/read-before-move. |

## Self Check

| Check | Result | Evidence | Follow-up |
|---|---|---|---|
| Requirement/source fact to implementation-step trace is complete | Pass for design stage | `06-implementation-plan.md` traceability table maps review findings and requirements to steps. | Recheck after task slices are created. |
| Stable source anchors are present or explicitly not applicable | Pass | `02-code-topology.md` source anchors name code symbols or Markdown headings. | Add exact new helper symbol after implementation starts. |
| Verification cells distinguish plan from executed evidence | Pass | All implementation checks are phrased as planned validation, not executed proof. | Record executed output in task slices after coding. |
| Document integrity was checked with available mechanical signals | Pass | `tasks.md` records strict-layout validation, index diagnostics, and `git diff --check` after final design convergence. | Recheck after task slices are created. |
| No circular dependency | Pass | Module topology keeps policy/schema below tools, resolver below doc/validator, prompts above tools. | Add dependency-cycle validator tests for execution-map rows. |
| No catch-all class without a bounded responsibility | Pass | `03-class-design.md` splits root context, map helper, assignment row, doc commands, and validator. | Keep helpers small during implementation. |
| Subsystem and module boundaries are distinct when needed | Pass | `02-code-topology.md` separates workflow-state subsystem from code modules. | Recheck if implementation introduces new modules. |
| Every core class maps to a file and test seam | Pass for planned helpers | `03-class-design.md` maps helper structures to source anchors and test seams. | Confirm exact file names in task slices. |
| Failure path and rollback path are documented | Pass | `04-runtime-flow.md` and `05-error-model.md` cover unresolved roots, duplicate state, idempotency, and rollback. | Add command-level tests. |
| Implementation steps can be compiled or verified incrementally | Pass | `06-implementation-plan.md` orders policy, resolver, commands, validator, Python parity, assets, projection. | Turn into task slices before coding. |
