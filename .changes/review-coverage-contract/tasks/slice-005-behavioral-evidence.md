---
artifact: task-slice
status: reviewed
tags: [implementation, review, validation]
description: "Slice 5: run the bounded two-phase deep-coverage evaluation and record evidence."
---
# Slice: behavioral-evidence

## Objective

Produce bounded evidence that a fresh phase-1 verifier remains independent of a
reviewer ledger and that phase 2 recognizes planted omissions, without claiming
model-general completeness.

## Scope

- Source design: `implementation-design/06-implementation-plan.md` step 5;
  `07-constraints.md` evidence-fidelity rule; requirements item 25 and
  `specs/review-coverage.md` verification-evidence scenario.
- Goal: record one client/model/configuration's two-phase deep evaluation with
  packet paths/digests, planted gaps, observed result, and exact limitation.
- Non-goals: treating static fixture checks as agent behavior proof, claiming
  cross-model generalization, persisting routine low-risk logs, or changing
  source code merely to make an evaluation appear successful.
- Scope: a controlled fixture run and formal change review record. If the
  available harness cannot dispatch a genuinely fresh agent, record that
  unavailable capability and its consequence rather than fabricating evidence.
- Subsystem: behavioral assurance evidence.
- Module: review-coverage fixtures and `.changes/<change>/reviews/` evidence.
- Changed surfaces: fixture inputs only if required for a complete reproducible
  run, plus one regulated review/evaluation artifact. No production source
  surface is planned.
- Prerequisites: slices 001-004 `READY`, deterministic fixture suite passing,
  and an available client invocation whose phase-1 packet can be isolated from
  the reviewer ledger.

## Steps

- [x] Select the smallest reproducible fixture with explicit expected unit,
      source, relation, and evidence omissions.
- [x] Dispatch phase 1 with target/rule-source fixture inputs but without the
      reviewer ledger; record its expected UnitKey-plus-RuleRef output.
- [x] Dispatch a fresh phase 2 with the phase-1 expectation and deliberately
      incomplete ledger; record omission and contract-regression results.
- [x] Record native-agent IDs, isolation boundary, fixture relation, results,
      and `verified (approximate)` fidelity in regulated review artifacts.

## Validation

- [x] Deterministic fixture and helper tests remain passing before the agent
      evaluation is run.
- [x] Review records prove phase 1 had no ledger input and fresh phase 2
      received only expected relation data plus an incomplete ledger.
- [x] The evaluation is labeled `verified (approximate)` with target/seal and
      model-general limits explicit; it cannot silently become a deep
      completeness claim.

## Review

- Review packet: fixture contents, phase input boundary, expected/packet
  digests, raw role outputs or summarized result references, and the exact
  evidence-fidelity statement.
- Review owner: independent evaluator/audit reviewer, separate from the agent
  producing phase-1 or phase-2 outputs when the available client supports it.
- Gate: `READY` for the named bounded run. An unavailable fresh-agent mechanism
  produces a `READY_WITH_NOTES` final planning decision only when the evidence
  itself remains labeled `blocked` or `partial`, with no generalized claim.

## Rollback

- No runtime state exists to roll back. Retain the formal evidence record; do
  not remove a limitation to improve a readiness label.

## Open Decisions

- None
