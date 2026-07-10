---
artifact: task-slice
status: reviewed
tags: [implementation, review, validation]
description: "Slice 2: document coverage packets and add planted-omission fixtures."
---
# Slice: packet-contract-fixtures

## Objective

Turn the frozen review-coverage protocol into the existing review-packet skill
contract and deterministic, human-readable fixtures without introducing a
ledger parser or serialized schema.

## Scope

- Source design: `implementation-design/02-code-topology.md` packet ownership;
  `03-class-design.md` Markdown role interfaces; `06-implementation-plan.md`
  step 2; `specs/review-coverage.md` packet, mode, gap, and gate requirements.
- Goal: the packet skill gives coordinator, reviewer, and verifier one exact
  coverage-mode and packet shape, while fixtures make omission classifications
  reviewable and reproducible.
- Non-goals: automatic Markdown/ledger parsing, target recomputation inside a
  role, project-specific review rules, a second review skill, and source edits
  outside the existing packet owner.
- Scope: target identity and input tables, declaration handling, expected and
  comparison packet copies/seal, ledger table contracts, gap taxonomy, four
  modes/gates, and planted-omission Markdown fixtures.
- Subsystem: review packet protocol.
- Module: `skills/review/review-packet-gate/SKILL.md`, focused skill assertions,
  and `tests/fixtures/review-coverage/`.
- Changed surfaces: packet skill; `tests/test-skills.js`; new fixture files;
  `tests/test-review-coverage.js` only for direct fixture/invocation checks.
- Prerequisites: slice 001 review gate `READY`, because the helper invocation
  and target blocks must name the shipped output contract.

## Steps

- [x] Add failing static/fixture checks for the required modes, field names,
      table separators, copied target blocks, seal invocation, gap taxonomy,
      and no-parser boundary.
- [x] Extend the packet skill with the frozen no-mode, quick, standard, and
      deep behavior, including mode escalation and separate gate semantics.
- [x] Add deterministic fixtures that plant omitted unit, rule-source,
      relation, evidence, stale-target, and conclusion-conflict cases with the
      expected classification recorded in Markdown.
- [x] Keep all role-facing packets Markdown and ensure expected packets copy
      target identity, input arguments, declaration, and execution coordinates
      verbatim before the seal.

## Validation

- [x] `npm test -- --skills --review-coverage` passes after initially failing
      assertions demonstrate the missing contract.
- [x] Static checks assert every normative packet table has a header and
      separator row and that no JSON schema, parser, or second skill root was
      added.
- [x] `git diff --check -- skills/review/review-packet-gate/SKILL.md tests/test-skills.js tests/test-review-coverage.js tests/fixtures/review-coverage` passes.

## Review

- Review packet: packet-skill diff, fixture inventory, static test output, and
  a traceability map to frozen packet/mode/gate requirements.
- Review owner: planning/protocol reviewer applying compatibility, operator
  usability, specification completeness, and no-new-state lenses.
- Gate: `READY` only when the protocol is explicit enough for a fresh role to
  follow without implied parser behavior or local-path identity.

## Rollback

- Revert coverage-specific skill sections, fixture files, and matching tests;
  retain the pre-existing evidence-first packet guidance.

## Open Decisions

- None
