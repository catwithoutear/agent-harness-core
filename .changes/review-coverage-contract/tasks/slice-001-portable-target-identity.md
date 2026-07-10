---
artifact: task-slice
status: reviewed
tags: [implementation, review, validation]
description: "Slice 1: implement deterministic read-only target and packet identities with focused tests."
---
# Slice: portable-target-identity

## Objective

Implement the bounded, read-only helper that makes a Git worktree or artifact
set reproducibly identifiable before any coverage packet or verifier depends on
it.

## Scope

- Source design: `implementation-design/03-class-design.md` framed identity
  contract; `04-runtime-flow.md` state transitions; `06-implementation-plan.md`
  step 1; `05-error-model.md` helper failure categories.
- Goal: the helper emits deterministic JSON identities for Git worktree and
  artifact-set targets and seals packet Markdown without local roots in success
  identity output.
- Non-goals: unit/rule discovery, ledger parsing, packet persistence, review
  decisions, a package CLI, a new schema, or edits to generic projector and
  manifest validators.
- Scope: canonical framing, staged/unstaged/untracked/declared-input components,
  artifact-set traversal, declaration normalization, packet sealing, structured
  errors, and direct deterministic tests.
- Subsystem: portable review identity.
- Module: `review-packet-gate` skill-local Node 20 helper and focused test
  runner registration.
- Changed surfaces: new
  `skills/review/review-packet-gate/scripts/review-packet-digest.mjs`, new
  `tests/test-review-coverage.js`, and `tests/run-tests.js` option routing.
- Prerequisites: implementation-design r04 `READY`; no code-slice dependency.

## Steps

- [x] Add failing focused tests for the public `target` and `packet` commands,
      then demonstrate that failure before helper creation.
- [x] Implement only the framed byte protocol, safe Git enumeration/content
      extraction, artifact-set traversal, declaration normalization, and
      stdout-only JSON contract selected in the implementation design.
- [x] Add success and error tests for staged/unstaged overlap, deletion,
      executable mode, symlink, unmerged index, scoped untracked files, ignored
      declared input, artifact set, CRLF/final-LF/BOM declaration handling,
      repeated argument order/duplicates, and packet seal verification.
- [x] Run focused verification and record the target/packet outputs used for
      the review packet.

## Validation

- [x] `npm test -- --review-coverage` fails for the missing behavior before
      implementation, then passes after implementation.
- [x] The focused suite proves that success output contains no local absolute
      roots and every failure has a stable nonzero structured error code.
- [x] `git diff --check -- skills/review/review-packet-gate/scripts/review-packet-digest.mjs tests/test-review-coverage.js tests/run-tests.js` passes.

## Review

- Review packet: helper diff; focused red/green test evidence; representative
  Git/artifact JSON; explicit confirmation of no writes, no parser, and no
  generic-library change.
- Review owner: independent implementation reviewer using byte-identity,
  portability, failure-model, and bounded-authority lenses.
- Gate: `READY` only after all focused tests pass and review finds no protocol
  drift; otherwise fix and re-review this slice before slice 002.

## Rollback

- Revert the new helper, focused test module, and runner route together. No
  persisted packet or user data migration is introduced.

## Open Decisions

- None
