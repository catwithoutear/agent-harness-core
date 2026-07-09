---
artifact: review-round
status: reviewed
tags: [review, worktree-work-promote]
description: "Subagent review synthesis for the shared-state worktree design."
---
# subagent-design Review Round 1

## Decision

`NOT_READY`

Three delegated read-only reviewers examined the converged shared-state
worktree design. Two reviewers found the design broadly sliceable, but the
correctness reviewer identified root-resolution and CLI-contract blockers that
can recreate the original wrong-root failure mode. Coordinator synthesis adopts
`NOT_READY` until those blockers are resolved in the design pack.

## Findings

| ID | Severity | Resolution |
|---|---|---|
| WWP-SUB-R01-F01 | Blocking | Root precedence can still select a linked worktree's accidental duplicate `.changes/<change>` before detecting linked-worktree ambiguity. Update the resolver contract so non-explicit roots block when the same change exists in multiple candidate roots. |
| WWP-SUB-R01-F02 | Blocking | Validator CLI syntax is inconsistent: the design requires `--state-root` and `--code-root`, but the interface draft only shows `--repo-root ... --worktrees`. Make validator root flags explicit and test `--state-root`, legacy `--repo-root`, conflicts, and `--code-root`. |
| WWP-SUB-R01-F03 | Blocking | Python parity remains a design decision, but current Python CLI/schema behavior already differs from JS. Decide before implementation whether Python fully mirrors V1 or returns explicit unsupported errors with tests. |
| WWP-SUB-R01-F04 | Should Fix | `execution-map.md` integration needs complete acceptance criteria for artifact front matter, allowed statuses, status-report visibility, strict-layout allowlist, inventory behavior, and top-level file limits. |
| WWP-SUB-R01-F05 | Should Fix | Worktree path semantics are underspecified. Define relative path base, persisted format, path normalization, symlink behavior, missing/unreadable path severity, and non-git worktree severity. |
| WWP-SUB-R01-F06 | Should Fix | `planned` status and `assign-slice` syntax conflict: `planned` permits blank branch/worktree, while `assign-slice` shows branch/worktree as required. Decide whether `planned` is command-createable or only manual/pre-generated. |
| WWP-SUB-R01-F07 | Should Fix | Stacked topology needs cross-row dependency-status rules for `ready` and `merged`, not just cycle detection and `blocked` checks. |

## Reviewer Positions

| Reviewer | Focus | Gate | Notes |
|---|---|---|---|
| planning-reviewer | Design readiness, topology, source anchors, simplification | `READY_WITH_NOTES` | Accepted overall design; requested worktree path semantics, planned/assign-slice clarification, stronger stacked dependency rules, and a Python parity slice. |
| correctness reviewer | CLI compatibility, root behavior, validator, JS/Python parity | `NOT_READY` | Found blockers in duplicate-root precedence, validator CLI contract, and Python parity. |
| implementation-planner | Task slicing and dependency order | `READY_WITH_NOTES` | Confirmed the design can become reviewable slices, but the slices form a dependency stack rather than parallel work. |

## Evidence

- Reviewed design pack:
  - `implementation-design/README.md`
  - `implementation-design/01-problem.md`
  - `implementation-design/02-code-topology.md`
  - `implementation-design/03-class-design.md`
  - `implementation-design/04-runtime-flow.md`
  - `implementation-design/05-error-model.md`
  - `implementation-design/06-implementation-plan.md`
  - `implementation-design/07-constraints.md`
- Source anchors cited by reviewers:
  - `lib/change/doc-tool.js:runChangeDoc`
  - `lib/change/validator.js:runChangeValidate`
  - `lib/change/harness_change_doc.py:build_parser`
  - `lib/change/harness_change_validate.py:main`
  - `schemas/change-workspace.schema.json`
- Validation observed during review:
  - `node bin/harness-change-validate.js --repo-root . --change worktree-work-promote`: ready, 0 errors, 0 warnings.
  - `git diff --check -- .changes/worktree-work-promote`: passed.

## Required Next Action

- Revise the implementation-design pack before task slicing.
- Treat F01-F03 as blocking.
- Carry F04-F07 into acceptance criteria for the first implementation slices if they are not fully resolved in the design text.
