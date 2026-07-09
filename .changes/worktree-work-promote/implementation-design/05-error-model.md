---
artifact: implementation-design-detail
status: reviewed
tags: [design, implementation]
description: "Error contract, retry, rollback, idempotency, and observability model."
---
# Error Model

## N/A Usage

Error handling is material because the change is meant to prevent writes to the
wrong workflow state root.

## Error Categories

| Error | Source | Caller-visible result | Retry | Rollback | Verification plan / evidence |
|---|---|---|---|---|---|
| Conflicting explicit roots | `--state-root` and `--repo-root` resolve to different paths. | `ERROR: conflicting state roots` with both paths. | Retry with one explicit root. | No write occurs. | Command test asserts nonzero exit and unchanged files. |
| Missing change workspace | Target `.changes/<change>` does not exist in the selected state root. | Existing `ERROR: change not found` behavior, with selected state root. | Retry with correct root or create structured workspace through approved flow. | No write occurs. | Existing tests plus root-resolution variant. |
| Linked worktree unresolved | Command runs from a linked worktree without an explicit state root and target change is absent locally. | `ERROR: state root unresolved` plus candidate roots when discoverable. | Retry with `--state-root` or approved env/config. | No write occurs. | Temp git worktree test or resolver fixture. |
| Duplicate inferred state roots | Non-explicit resolution finds the same `.changes/<change>` in the current linked worktree and at least one other candidate. | `ERROR: ambiguous state root` plus candidate roots. | Retry with explicit `--state-root` after inspecting candidates. | No write occurs. | Resolver test where current worktree has an accidental duplicate. |
| Duplicate local state | Non-terminal assigned worktree contains `.changes/<same-change>` that is not the canonical state root. | Validator `ERROR` in `--worktrees` mode; terminal rows produce `WARN`. | Move/consolidate/remove accidental duplicate after reading it, or keep terminal history with warning evidence. | Validator only; no mutation. | Validator tests create duplicate under active and terminal assigned worktrees. |
| Missing or invalid worktree path | `Worktree` is required by status, missing, unreadable, non-git, or normalizes to a duplicate real path. | Validator `ERROR` for `active`/`ready`, `WARN` for pre-active states as specified in runtime flow. | Create/fix the worktree, mark blocked with evidence, or update the assignment. | Command failure leaves prior row; validator is read-only. | Worktree validation table cases. |
| Invalid execution-map columns | Map table missing required columns. | Validator `ERROR`; `execution-map --json` returns nonzero. | Restore generated map header or rerun `assign-slice`. | Manual file fix or command rewrite. | Parser tests. |
| Invalid status transition | Assignment moves to an illegal state for the recorded prior state. | `assign-slice` error when previous state is known; validator error for static invalid terminal rows. | Use allowed transition or mark superseded with evidence. | Prior file remains unchanged if command fails. | Command tests for illegal transitions. |
| Missing evidence for gated state | `blocked`, `ready`, or `merged` row lacks `Last Evidence`. | Validator `ERROR`. | Add task-slice/review/handoff evidence pointer. | No mutation by validator. | Validator table cases. |
| Invalid evidence reference | `Last Evidence` is absolute, escapes the change workspace, points to a missing path, or names a missing Markdown heading. | Validator `ERROR` with the row and reference. | Move evidence into the canonical workspace or correct the reference. | Validator only; no mutation. | Validator tests for path escape, missing file, valid file, valid heading, and missing heading. |
| Topology mismatch | `parallel` has dependencies or `stacked` lacks dependency/base. | Validator `ERROR`; command rejects obvious invalid input. | Correct topology or dependency fields. | Command failure leaves prior row. | Validator and command tests. |
| Stacked dependency status mismatch | A `ready` or `merged` stacked row has dependencies in incompatible states. | Validator `ERROR` listing row and dependency statuses. | Finish/merge lower slice first or change topology. | Validator only; no mutation. | Validator tests for ready and merged dependency rules. |
| Python parity gap | JS command behavior is added but Python mirror lacks support. | Tests fail. | Implement Python parity before merging V1. | N/A. | Extended Python parity tests for root flags, schema precedence, execution-map commands, and worktree validation. |

## Idempotency

- `assign-slice` is idempotent when rerun with the same values: the map content
  remains unchanged except for stable formatting.
- Updating one slice row must not reorder unrelated rows except for deterministic
  sorting if the implementation chooses sorted output.
- Failed commands write nothing. Implement writes through in-memory render plus
  one final `writeText` after validation.
- Validator is read-only.
- `resolve` and `execution-map --json` are read-only. When `execution-map.md`
  is absent, `execution-map --json` returns `exists: false` and an empty
  assignment list.

## Cleanup and Partial Failure

- If `assign-slice` fails before rendering, no file is created or changed.
- If map creation succeeds but validation later reports an invalid worktree,
  cleanup is a normal map update or manual edit to the canonical state root.
- Accidental `.changes/<same-change>` under a linked worktree is never removed
  automatically. The validator reports it and points to `--inventory` or manual
  read-before-cleanup workflow.
- Rollback of a bad assignment is another `assign-slice` update to the previous
  values or a `superseded` status with evidence.
- Cross-machine handoff does not rely on the `Worktree` path as portable truth.
  The receiver reassigns stale local paths through `assign-slice`; evidence
  references remain portable because they are change-relative.

## Logs, Metrics, and Troubleshooting Anchors

- CLI errors should include selected `state_root`, `code_root` when relevant,
  and whether the value came from `--state-root`, `--repo-root`, environment,
  cwd, or git/worktree candidates.
- JSON resolve output should include:
  - `state_root`
  - `code_root`
  - `change_id`
  - `source`
  - `is_linked_worktree`
  - `candidates`
  - `unresolved_reason`
- Text validator output should follow existing `ERROR` and `WARN` style.
- Do not log secrets, environment dumps, or full unrelated git configuration.
