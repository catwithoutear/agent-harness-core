---
artifact: review-round
status: reviewed
tags: [review, workflow, review-coverage, review-verification]
description: "Re-review of r01 corrections; identifies cross-agent relation identity requirements."
---
# draft Review Round 2

## Decision

`NOT_READY`

RCC-R01-F01 through RCC-R01-F09 are resolved by the corrected requirements,
proposal, design, terminology, and behavioral delta spec. One new blocking
identity contract prevents independent comparison from being reliable.

- Challenge verdict: `NOT_READY`.
- Multi-lens design decision: `NOT_READY`.
- Council escalation: not required; the new issue has a local, evidence-backed
  correction path.

## Re-review Disposition

| Prior finding | Status | Evidence |
|---|---|---|
| RCC-R01-F01 | resolved | Requirements 12 and design Rule Results define one result per considered relation. |
| RCC-R01-F02 | resolved | Requirements 9-11 and design Rule Source Inventory define discovery, availability, and source-version limits. |
| RCC-R01-F03 | resolved | Requirements 14-15 and design Expected Coverage/Comparison Packets remove same-session dependency. |
| RCC-R01-F04 | resolved | Requirements 18-19 and design Assurance Model separate coverage and review decisions. |
| RCC-R01-F05 | resolved | Requirements 2-4 and design Portable Target Fingerprint separate durable target identity from local execution coordinates. |
| RCC-R01-F06 | resolved | Requirements 20-22 and design Coverage Modes define mandatory deep triggers and downgrade limits. |
| RCC-R01-F07 | resolved | Requirements 25, design Validation Design, and the delta spec assign fixtures and fresh-agent evidence. |
| RCC-R01-F08 | resolved | Requirements 10 and design RuleRef version forms cover Git, package, projection, and content sources. |
| RCC-R01-F09 | resolved | Requirements 12 and design V1 tables select normalized Markdown without a parser. |

## Challenge Assumptions

| Assumption | Status | Evidence and consequence |
|---|---|---|
| Per-rule audit trail is now representable. | verified | Rule Results separates applicability, disposition, evidence, and findings per relation. |
| Rule-source omission has a declared assurance boundary. | verified | Rule Source Inventory and unavailable-source behavior define coverage relative to discoverable sources. |
| Two-phase verifier dispatch is portable. | verified | Immutable phase packets permit fresh-agent comparison. |
| Phase-1 expected relations can be compared with reviewer results using local `UnitId`. | disputed | Phase 1 cannot coordinate identifiers with a reviewer it must not influence; current documents do not define canonical unit matching. |
| RuleRef is comparable in V1 Markdown output. | partial | The contract defines a structured RuleRef, but the Rule Results table and example still render a single shorthand value. |

## Pre-Mortem

1. Phase 1 emits `U-001` for `src/cache.cpp:Cache::put`, while the reviewer emits
   `U-017` for the same unit. A naive comparison reports both missing and extra
   units instead of comparing the actual relation.
2. Two reviewers write different shorthand rule IDs for the same source section,
   causing a false `RULE_COVERAGE_GAP` or a silent incorrect match.
3. A phase-2 verifier reconciles names by intuition after seeing reviewer output,
   reintroducing unrecorded judgement and defeating the deterministic coverage
   claim.

## Selected Lenses

| Lens | Result | Reason |
|---|---|---|
| `boundary_contracts` | `NOT_READY` | Expected and observed relation identity lacks a cross-agent equality contract. |
| `control_lifecycle` | `NOT_READY` | Phase 1 and phase 2 cannot safely exchange relation sets without stable keys. |
| `verification_observability` | `READY_WITH_NOTES` | Fixtures are now specified, but must add the stable-key comparison case. |
| `implementation_readiness` | `NOT_READY` | Packet/table fields remain ambiguous for the comparison implementation seam. |
| `artifact_chain` | `NOT_READY` | Requirements, design, terminology, and spec all inherit `UnitId` as a cross-packet relation identifier. |

## Findings

### Blocking

| ID | Category | Finding and evidence | Required correction |
|---|---|---|---|
| RCC-R02-F10 | correctness / control-flow / artifact-chain | The verifier independently creates Expected Rule Relations before reviewer output, but design and delta spec identify those relations with local `UnitId`. `UnitId` is only stable within one table/ledger; independent agents can choose different IDs for the same semantic unit. The current Rule Results example also uses shorthand `R-COR-02` although RuleRef is defined as a versioned structure. Phase 2 therefore has no deterministic equality key for expected versus observed relations. | Replace cross-packet `UnitId` matching with a canonical target-bound `UnitKey`. Flatten RuleRef table columns into `RuleId`, `RuleSourceRef`, and `RuleVersionRef`, or define an equivalent canonical RuleKey. Expected relations and reviewer results must compare on the same normalized key tuple. Keep local display IDs only if they are explicitly non-authoritative. Add `UNIT_IDENTITY_GAP` and a fresh-agent/fixture scenario where phase 1 and reviewer use different local labels for the same unit. |

### Should Fix

| ID | Category | Finding and evidence | Recommended correction |
|---|---|---|---|
| RCC-R02-F11 | artifact-chain | Requirements Functional Requirement 18 names `coverage_gate`, `review_gate`, and `overall_gate`, while the design and acceptance criteria define a fourth `implementation_verification_gate`. The intended model is clear but the top-level requirement is incomplete. | Amend Functional Requirement 18 to name all four gates and make the composition input explicit. |

## Evidence Checked

- All draft artifacts under `.changes/review-coverage-contract/`, including the
  new `specs/review-coverage.md`.
- r01 review finding dispositions and required re-review criteria.
- Current `review-packet-gate`, `workflow-control`, reviewer/planning-reviewer
  roles, manifest agent projection, projector rendering, and subagent tests.
- `node bin/harness-change-doc.js --state-root . --code-root . resolve --change review-coverage-contract --json`.
- `node bin/harness-change-validate.js --state-root . --change review-coverage-contract --strict-layout`: pass, zero errors and zero warnings before r02.

## Required Next Action

1. Correct RCC-R02-F10 and RCC-R02-F11 in requirements, research, proposal,
   design, terminology, delta spec, tasks, and examples as applicable.
2. Add canonical-key fixture coverage for independent phase-1 and reviewer labels.
3. Run draft-r03 challenge and multi-lens re-review before freeze.

## Re-review Criteria

- Expected and observed units have a canonical target-bound equality key.
- Expected and observed rules have canonical source/version identity in Markdown.
- The relation comparison key does not rely on same-agent-local identifiers.
- All four gate inputs are named consistently across requirements, design, and
  delta spec.
