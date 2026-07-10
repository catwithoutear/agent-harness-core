---
artifact: delta-spec
status: frozen
tags: [workflow, review, review-coverage, review-verification, rule-profile]
description: "Behavioral requirements for auditable review coverage and independent deep verification."
---

# Review Coverage Contract

## Purpose

Define project-agnostic behavior for binding review evidence to source state,
recording per-rule review results, independently verifying deep coverage, and
composing coverage with correctness and implementation-verification gates.

## Traceability

- Requirements source: `../requirements.md` Functional Requirements and Coverage
  Mode Requirements.
- Design source: `../design.md` packet, ledger, verifier, gate, and re-review
  contracts.
- Review source: `../reviews/draft-r01.md` findings RCC-R01-F01 through F09.

## ADDED Requirements

### Requirement: Portable Review Target

Every review SHALL bind its evidence to a Portable Target Fingerprint. Local
change roots and worktree paths SHALL be conditional Execution Coordinates and
SHALL NOT replace portable identity.

#### Scenario: Uncommitted worktree review

- Given a base revision with staged, unstaged, and scoped untracked changes,
- when a review packet is created,
- then its fingerprint covers those inputs and lists excluded generated or
  ignored inputs with reasons.

#### Scenario: Review without a change workspace

- Given a generic repository review with no active `.changes` workspace,
- when the target packet is created,
- then no synthetic `state_root` or active change is required.

### Requirement: Independently Discoverable Rule Universe

Deep verification SHALL produce a Rule Source Inventory from the discovery
policy and current evidence. Packet rule sources SHALL be treated as a seed.

#### Scenario: Packet omits a repository-owned rule source

- Given a discovery policy that includes the effective repository rule roots,
- and a packet seed that omits one active source,
- when verifier inventory mode runs,
- then the source is added to the Rule Source Inventory or reported as a
  `RULE_SOURCE_GAP`.

#### Scenario: Required source is unavailable

- Given an active required instruction source that the verifier cannot inspect,
- when the coverage gate is evaluated,
- then the gate is not `READY` and the unavailable source is named.

### Requirement: Versioned Rule Identity

Every considered rule SHALL have a RuleRef containing `rule_id`, `source_ref`,
and `version_ref`. File-backed source references SHALL use normalized source path
plus stable section/key anchor and occurrence ordinal where duplicates are legal.

#### Scenario: Rule is not Git-backed

- Given an installed skill or generated projection without a repository commit,
- when its rule is added to the Review Profile,
- then `version_ref` uses a package version, projection hash, or content digest.

### Requirement: Canonical Cross-Packet Identity

Expected coverage and reviewer results SHALL compare canonical UnitKey-plus-rule
tuples. UnitKey SHALL use explicit UnitPath, AnchorKind, and AnchorValue columns
under the target fingerprint. UnitPath SHALL be target-tree-relative,
`/`-separated, exact-case, and free of `.` or `..` segments. Rule output SHALL
expose RuleId, RuleSourceRef, and RuleVersionRef rather than an opaque local
shorthand.

#### Scenario: Independent agents use different local labels

- Given verifier phase 1 and reviewer each choose different local display labels
  for the same function,
- when comparison runs,
- then their matching UnitKey and flattened rule fields identify one relation
  rather than producing false missing and extra results.

#### Scenario: Overloaded symbols and repeated headings

- Given overloaded functions or repeated document headings,
- when UnitKey values are emitted,
- then symbol anchor values include a fully qualified declaration signature and
  heading values include full ancestry plus occurrence ordinal.

#### Scenario: Non-normalized path

- Given a UnitPath with a non-normalized separator, casing mismatch, `.` or `..`
  segment,
- when comparison validates the tuple,
- then it reports `UNIT_IDENTITY_GAP` rather than silently normalizing a match.

#### Scenario: Unit identity cannot be normalized

- Given a reviewer result without a usable target-bound UnitKey,
- when comparison runs,
- then it reports `UNIT_IDENTITY_GAP` and does not infer a match from local IDs.

### Requirement: Per-Relation Review Results

Reviewer output SHALL contain a Unit Inventory and one Rule Result for every
expected or explicitly considered UnitKey-plus-rule tuple.

#### Scenario: Multiple rules apply to one unit

- Given one Coverage Unit with correctness, error-handling, simplicity, and
  concurrency rules,
- when the reviewer reports coverage,
- then each rule has its own applicability, disposition, evidence, finding links,
  and notes.

#### Scenario: Rule is not applicable

- Given a rule selected for applicability assessment but not applicable to the
  unit,
- when the reviewer records the result,
- then applicability is `not-applicable`, disposition is `n/a`, and evidence and
  reason are present.

### Requirement: Reviewer Rule-Source Evidence

Reviewer output SHALL contain compact Observed Rule Sources records with
RuleSourceRef, RuleVersionRef, disposition, evidence, and notes. RuleSourceRef
SHALL use normalized source path or canonical package/projection identity plus a
stable section or key anchor.

#### Scenario: Reviewer expands a source seed

- Given a reviewer discovers an additional rule source through the discovery
  policy,
- when the ledger is returned,
- then Observed Rule Sources records that source and version so phase 2 can
  compare it with the Expected Coverage Packet.

#### Scenario: Reviewer excludes a source

- Given a rule source is in scope but not applicable to the target,
- when the reviewer records the exclusion,
- then Observed Rule Sources includes `excluded-with-reason` and evidence.

### Requirement: Portable Two-Phase Verification

Deep verification SHALL separate independent inventory from ledger comparison
through immutable packets and SHALL NOT require same-agent resume behavior.

#### Scenario: Fresh verifier performs comparison

- Given a sealed Expected Coverage Packet and a reviewer ledger with matching
  target fingerprint,
- when a fresh verifier receives a Comparison Packet,
- then it can compare units, sources, relations, evidence, and staleness without
  prior session context.

#### Scenario: Expected packet changed after reviewer output

- Given an Expected Coverage Packet whose digest no longer matches,
- when comparison begins,
- then comparison returns `STALE_REVIEW` or `NOT_READY` instead of rebuilding
  expectations from reviewer output.

### Requirement: Coverage Gap Classification

The verifier SHALL distinguish code-scope, rule-source, rule-relation,
applicability, evidence, staleness, conclusion-conflict, and context gaps.

#### Scenario: Unit is present but one rule result is absent

- Given an expected UnitKey-plus-rule tuple missing from reviewer Rule Results,
- when comparison runs,
- then it reports `RULE_COVERAGE_GAP`, not `CODE_SCOPE_GAP`.

### Requirement: Proportional Coverage Modes

Coverage routing SHALL distinguish quick, standard, and deep assurance and SHALL
enforce mandatory deep triggers.

#### Scenario: Low-risk documentation-only review

- Given directly enumerable documentation changes with no behavior or contract
  effect,
- when quick mode is selected,
- then the output does not claim independent completeness.

#### Scenario: Security boundary change

- Given a change to a security or trust boundary,
- when coverage mode is selected,
- then deep mode is required unless an owner records a downgrade decision and
  residual risk; downgraded coverage is at most `READY_WITH_NOTES`.

### Requirement: Separate Gate Decisions

Coverage, correctness review, implementation verification, and overall workflow
SHALL have separate assurance-labeled gate decisions.

#### Scenario: Complete review finds a blocking defect

- Given all expected units and rules are covered,
- and the review identifies a blocking correctness defect,
- when gates are composed,
- then `coverage_gate=READY`, `review_gate=NOT_READY`, and
  `overall_gate=NOT_READY`.

#### Scenario: Tests fail after coverage-ready review

- Given coverage and review gates that permit progression,
- and implementation verification fails,
- when the overall gate is recomputed,
- then prior coverage evidence remains valid while implementation-verification
  and overall gates are `NOT_READY`.

### Requirement: Delta Re-Review

Changes to target fingerprint, packet digest, UnitKey, RuleRef, or material
dependency SHALL invalidate affected review results.

#### Scenario: Fix changes reviewed code

- Given a prior ledger and a new patch digest after a fix,
- when re-review begins,
- then prior findings are dispositioned, affected units and relations are
  re-reviewed, and unchanged rows are carried only with matching identities and
  dependencies.

### Requirement: Verification Evidence

Implementation SHALL distinguish static contract/projection checks from
fresh-agent behavioral evidence.

#### Scenario: Omission-detection behavior is claimed

- Given deterministic fixtures with planted omissions,
- when the protocol is declared effective,
- then at least one fresh-agent evaluation demonstrates phase-1 independence and
  phase-2 detection, or the missing execution evidence is recorded as a residual
  limitation.
