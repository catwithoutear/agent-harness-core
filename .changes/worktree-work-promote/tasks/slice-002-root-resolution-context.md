---
artifact: task-slice
status: reviewed
tags: [implementation, worktree-work-promote, state-root]
description: "Slice 2: add shared root context resolution for state/code root selection."
---
# Slice: root-resolution-context

## Objective

Introduce one shared root-resolution contract so regulated writes select the
canonical state root only after resolving code-root and linked-worktree
ambiguity.

## Scope

- Source design: `implementation-design/03-class-design.md`
  `ChangeRootContext`; `implementation-design/04-runtime-flow.md` "Root
  Resolution Precedence"; `implementation-design/05-error-model.md` root errors.
- Goal: JS change tools can distinguish `state_root`, `code_root`,
  `change_id`, candidate roots, source, linked-worktree status, and unresolved
  reasons before any regulated write.
- Non-goals: execution-map parsing/upsert, worktree row validation, Python
  parity, prompt/skill wording, or git ref/worktree mutation.
- Scope: shared JS resolver plus integration at JS doc/validator entry points
  where current direct `--repo-root` joins would otherwise hide ambiguity.
- Subsystem: change workspace root resolution.
- Module: JS change tooling.
- Changed surfaces: new `lib/change/root-resolution.js`,
  `lib/change/doc-tool.js:runChangeDoc`, `lib/change/validator.js:runChangeValidate`,
  and `tests/test-change-tools.js`.
- Prerequisites: slice 001 policy/schema registration merged or otherwise not
  conflicting; design gate `READY`.

## Steps

- [x] Add `ChangeRootContext` and `resolveChangeContext` with explicit
      `--state-root`, legacy `--repo-root`, optional `--code-root`, and
      `HARNESS_CHANGE_STATE_ROOT` handling.
- [x] Gather non-explicit candidates from cwd-under-`.changes`, current repo
      root, and discoverable linked worktrees before selecting an inferred root.
- [x] Block regulated writes when duplicate non-explicit candidates contain the
      same `.changes/<change>`.
- [x] Preserve backward-compatible explicit `--repo-root` behavior.
- [x] Integrate the resolver into JS doc/validator command entry points without
      changing execution-map behavior yet.
- [x] Add tests for explicit roots, conflicts, environment fallback,
      cwd-under-change, duplicate local linked candidate, other-worktree
      candidate unresolved, and failed write leaves files unchanged.

## Validation

- [x] `node tests/run-tests.js --change-tools`: passed after tests were added before implementation and initially failed on missing `root-resolution.js`.
- [x] Focused fixture check for duplicate `.changes/<change>` in a linked
      worktree returning unresolved before write: covered by
      `root resolver blocks duplicate linked-worktree state before write`; neither
      candidate workspace receives `terminology.md`.
- [x] `node bin/harness-change-validate.js --repo-root . --change worktree-work-promote --strict-layout`: ready, 0 errors, 0 warnings.
- [x] `git diff --check -- lib/change/root-resolution.js lib/change/doc-tool.js lib/change/validator.js tests/test-change-tools.js`: passed.

## Review

- Review packet: resolver source diff, command integration diff, root-resolution
  fixture outputs, and no-write proof for ambiguous candidates.
- Review owner: reviewer for CLI compatibility and root safety.
- Review round: `reviews/slice-002-r01.md`.
- Gate: `READY`.

## Rollback

- Revert `root-resolution.js`, JS entry-point integration, and tests. Existing
  `--repo-root` behavior is restored.

## Open Decisions

- None
