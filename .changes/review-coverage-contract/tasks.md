---
artifact: tasks
status: reviewed
tags: [workflow, review, validation, review-coverage, review-verification]
description: "Design convergence and implementation task slices for the review coverage contract."
---

# Tasks

## 1. Implementation

- [x] Record requirements, current-source evidence, alternative approaches,
      terminology, and the initial selected design.
- [x] Challenge the draft against current harness ownership, packet contracts,
      role boundaries, and proportionality requirements.
- [x] Run multi-lens design review for boundary contracts, control flow,
      verification assurance, implementation readiness, and artifact-chain
      consistency.
- [x] Resolve RuleRef identity, deep-mode dispatch triggers, and V1 ledger
      serialization.
- [x] Add the internally consistent behavioral delta spec after applying r01
      corrections.
- [x] Freeze the accepted protocol after a clean r04 re-review.
- [x] Create and review the implementation-design topology pack required by the
      selected cross-asset direction.
- [x] Slice implementation after the draft and implementation design are
      reviewed.
- [x] Complete slice 001: portable target identity and deterministic helper
      tests.
- [x] Complete slice 002: packet protocol contract and planted-omission
      fixtures.
- [x] Complete slice 003: delegated verifier role and four-client projection.
- [x] Complete slice 004: workflow and command mode routing.
- [x] Complete slice 005: bounded fresh-agent behavioral evidence or an
      explicit residual limitation.
- [x] Complete slice 006: integration verification, final review, and handoff.

The ordered, review-gated implementation contract is indexed in `tasks/README.md`.

### Review Finding Disposition

- [x] RCC-R01-F01: replace unit-level disposition with per-rule Rule Results.
- [x] RCC-R01-F02: add Rule Source Inventory and unavailable-source boundary.
- [x] RCC-R01-F03: define immutable Expected Coverage and Comparison Packets.
- [x] RCC-R01-F04: separate coverage, review, implementation-verification, and
      overall gates.
- [x] RCC-R01-F05: separate Portable Target Fingerprint from optional Execution
      Coordinates and define uncommitted fingerprint inputs.
- [x] RCC-R01-F06: define mandatory mode triggers, escalation, and downgrade
      consequences.
- [x] RCC-R01-F07: assign deterministic fixtures and fresh-agent evaluation.
- [x] RCC-R01-F08: support Git, package, projection, and content RuleRef versions.
- [x] RCC-R01-F09: use normalized Unit Inventory and Rule Results Markdown tables
      without a V1 parser.
- [x] RCC-R02-F10: replace cross-packet local UnitId matching with canonical
      UnitKey and flattened versioned rule fields.
- [x] RCC-R02-F11: name implementation-verification as a fourth required gate.
- [x] RCC-R03-F12: define normalized UnitPath, AnchorKind, and AnchorValue
      grammar for cross-agent comparison.
- [x] RCC-R03-F13: add reviewer Observed Rule Sources to comparison evidence.

## 2. Validation

- [x] Resolve `state_root`, `code_root`, and active change with
      `harness-change-doc`.
- [x] List and index the current draft artifacts with no diagnostics.
- [x] Validate the change workspace with zero errors and zero warnings.
- [x] Scan the written draft for placeholders, contradictions, and ambiguous
      assurance claims.
- [x] Record the formal draft review gate before changing artifact status.
- [x] Re-run change validation and record the draft-r02 gate.
- [x] Resolve cross-agent canonical relation identity.
- [x] Re-review the canonical identity contract in draft-r03.
- [x] Resolve UnitKey grammar and observed rule-source evidence.
- [x] Re-review the normalized identity and source-evidence contract in draft-r04.
- [x] Record the converged draft-r04 `READY` gate and freeze decision.
- [x] Create the standard implementation-design pack through
      `harness-change-doc`.
- [x] Converge implementation-design r01-r04, including identity, artifact,
      packet, compatibility, table-integrity, and multi-lens review findings.
- [x] Validate the reviewed implementation-design pack with zero change-workspace
      errors and warnings.
- [x] Validate each implementation slice before its review gate and rerun strict
      change validation after task and review evidence changes.
