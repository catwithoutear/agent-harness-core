---
artifact: task-slice
status: reviewed
tags: [implementation, worktree-work-promote, python]
description: "Slice 5: mirror V1 public behavior in Python change tools."
---
# Slice: python-parity

## Objective

Mirror the V1 public behavior in Python change tools after the JS behavior is
stable.

## Scope

- Source design: `implementation-design/03-class-design.md` "Python parity
  decision"; `implementation-design/06-implementation-plan.md` step 5;
  `reviews/subagent-design-r01.md` WWP-SUB-R01-F03.
- Goal: Python policy, doc tool, and validator expose the same public V1
  behavior as the JS change tools for root flags, execution-map commands,
  repo-local schema precedence, status output, and worktree validation.
- Non-goals: inventing Python-only command semantics, changing JS behavior,
  workflow prompt updates, or projection refresh.
- Scope: Python policy/parser/validator parity and tests matched to JS fixtures.
- Subsystem: change tooling parity.
- Module: Python change tooling.
- Changed surfaces: `lib/change/policy.py`,
  `lib/change/harness_change_doc.py:build_parser`,
  `lib/change/harness_change_validate.py:main`, Python test coverage in the
  existing test harness, and parity fixtures if needed.
- Prerequisites: slices 001-004 complete and reviewed; JS public behavior is the
  source of truth for parity.

## Steps

- [x] Mirror `execution-map` artifact policy in Python.
- [x] Add/align root flags: canonical `--state-root`, legacy `--repo-root`,
      optional `--code-root`, and conflict behavior.
- [x] Mirror repo-local schema precedence used by JS validation.
- [x] Mirror `resolve`, `execution-map --json`, and `assign-slice` documented
      behavior, including absent-map JSON and evidence/worktree input rules.
- [x] Mirror `--worktrees` validation behavior and status output for public V1
      cases.
- [x] Add parity tests that reuse or match the JS behavior fixtures.

## Validation

- [x] Existing Python change-tool tests.
- [x] `node tests/run-tests.js --change-tools`
- [x] Parity cases for root flags, conflicting roots, repo-local schema,
      execution-map commands, absent-map JSON, evidence references, and
      worktree validation.
- [x] `git diff --check`

Evidence:

- `python3 -m py_compile lib/change/root_resolution.py lib/change/execution_map.py lib/change/harness_change_doc.py lib/change/harness_change_validate.py lib/change/policy.py`: passed.
- `node tests/run-tests.js --change-tools`: passed after the Python parity fix and review-loop conflict-output correction.
- `git diff --check -- lib/change/root_resolution.py lib/change/execution_map.py lib/change/harness_change_doc.py lib/change/harness_change_validate.py lib/change/policy.py tests/test-change-tools.js`: passed.

## Review

- Review packet: Python diffs, mapping table from JS behavior to Python tests,
  and any intentionally unsupported internal helper option with rationale.
- Review owner: reviewer for cross-client CLI compatibility.
- Review round: `reviews/slice-005-r01.md`
- Gate: `READY`; proceed to slice 006.

## Rollback

- Revert Python policy/parser/validator/test changes. If rollback exposes JS
  behavior without Python parity, reopen V1 scope before merging.

## Open Decisions

- None
