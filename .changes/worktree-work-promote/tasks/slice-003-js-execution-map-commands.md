---
artifact: task-slice
status: reviewed
tags: [implementation, worktree-work-promote, execution-map]
description: "Slice 3: implement JS resolve, execution-map, and assign-slice commands."
---
# Slice: js-execution-map-commands

## Objective

Implement the JS command surface that reads and updates `execution-map.md`
without creating task slices or mutating git worktrees.

## Scope

- Source design: `implementation-design/03-class-design.md` "Interface Drafts",
  "Execution-map artifact contract", "Evidence reference contract", and
  "Worktree path semantics"; `implementation-design/06-implementation-plan.md`
  step 3.
- Goal: provide read-only `resolve`, read-only `execution-map --json`, and
  `assign-slice` upsert behavior with idempotent Markdown rendering.
- Non-goals: full `--worktrees` validator checks, Python parity, prompt/skill
  updates, task-slice creation, or git worktree creation/checkout/rebase.
- Scope: JS doc-tool command parsing, execution-map parser/renderer/upsert
  helper, worktree path normalization for persisted local execution
  coordinates, evidence-reference syntax validation where command inputs are
  present, and command tests.
- Subsystem: execution-map command surface.
- Module: JS change doc tool.
- Changed surfaces: `lib/change/doc-tool.js:runChangeDoc`, `lib/change/markdown.js`
  if reusable table helpers need a small extension, focused helper module only
  if needed by complexity, and `tests/test-change-tools.js`.
- Prerequisites: slice 001 for artifact policy; slice 002 for root resolution.

## Steps

- [x] Add `resolve --json` output using the shared root context.
- [x] Add `execution-map <change> --json` that returns `exists: false`,
      `assignments: []`, and root context when the map is absent, without
      creating the file.
- [x] Add execution-map table parse/render with stable column ordering and
      front matter preservation.
- [x] Add `assign-slice` row creation/update for existing task slices only.
- [x] Enforce status-driven command input rules: `planned` may omit branch and
      worktree; non-planned execution states require them; gated statuses
      require `Last Evidence`.
- [x] Persist normalized absolute local `Worktree` values and compare existing
      paths by realpath for duplicate active assignment protection.
- [x] Keep `Last Evidence` change-relative and reject absolute, escaping, URL,
      commit-only, or free-text values at command time when provided.
- [x] Add idempotency tests for rerunning the same `assign-slice` values.

## Validation

- [x] `node tests/run-tests.js --change-tools`: passed after command tests were added before implementation and initially failed on missing commands.
- [x] Command test: absent `execution-map --json` returns `exists: false` and
      does not create `execution-map.md`.
- [x] Command test: `assign-slice --status planned` succeeds without branch or
      worktree for an existing task slice.
- [x] Command test: non-planned assignment fails without branch/worktree.
- [x] Command test: repeated assignment is stable and does not reorder unrelated rows.
- [x] Command test: duplicate active worktree and invalid `Last Evidence` are rejected before rewriting the map.
- [x] `git diff --check -- lib/change/execution-map.js lib/change/doc-tool.js lib/change/js-policy.js tests/test-change-tools.js`: passed.

## Review

- Review packet: command syntax diff, generated map fixture, absent-map JSON
  output, idempotency test output, and confirmation that task slice bodies and
  git worktrees are untouched.
- Review owner: reviewer for CLI behavior and Markdown artifact stability.
- Review round: `reviews/slice-003-r01.md`.
- Gate: `READY`.

## Rollback

- Revert command dispatch, helper code, generated fixtures, and tests. Remove
  any test-created `execution-map.md` fixtures only if they are not intended
  artifacts.

## Open Decisions

- None
