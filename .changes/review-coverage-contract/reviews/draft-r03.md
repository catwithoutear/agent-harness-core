---
artifact: review-round
status: reviewed
tags: [review, workflow, review-coverage, review-verification]
description: "Re-review of canonical relation identity; identifies normalized UnitKey grammar requirements."
---
# draft Review Round 3

## Decision

`NOT_READY`

RCC-R02-F10 and RCC-R02-F11 are resolved: V1 no longer relies on local UnitId,
Rule Results flatten versioned rule fields, and all four gates are required.
One blocking ambiguity remains in the canonical UnitKey grammar.

- Challenge verdict: `NOT_READY`.
- Multi-lens design decision: `NOT_READY`.
- Council escalation: not required; the ambiguity is local to normalized packet
  fields and does not challenge the selected architecture.

## Re-review Disposition

| Prior finding | Status | Evidence |
|---|---|---|
| RCC-R01-F01 through RCC-R01-F09 | resolved | r02 disposition remains valid after the V1 table revision. |
| RCC-R02-F10 | resolved | Requirements, design, terminology, and delta spec replace local UnitId with UnitKey and flattened rule fields. |
| RCC-R02-F11 | resolved | Requirements Functional Requirement 18 now names coverage, review, implementation-verification, and overall gates. |

## Challenge Assumptions

| Assumption | Status | Evidence and consequence |
|---|---|---|
| Independent agents can compare semantic units without shared local IDs. | partial | UnitKey exists, but its current string form does not define path normalization or unique anchor grammar. |
| Flattened RuleId, RuleSourceRef, and RuleVersionRef remove opaque rule matching. | verified | The Rule Results and expected relation contracts now expose all three identity fields. |
| Coverage source comparison can be audited from reviewer output. | partial | Requirements say reviewer expands rule-source seeds, but the ledger does not yet require observed source evidence. |

## Pre-Mortem

1. A C++ overload pair `Foo::bar(int)` and `Foo::bar(std::string)` both appear as
   `symbol:Foo::bar`; comparison incorrectly merges distinct coverage units.
2. A case-folding client or a path containing `.` or `..` emits a different
   UnitKey for the same target file; phase 2 reports false gaps.
3. A reviewer uses an additional rule source but does not record it; phase 2 can
   see missing relations but cannot distinguish reviewer expansion from an
   unrecorded source-discovery discrepancy.

## Selected Lenses

| Lens | Result | Reason |
|---|---|---|
| `boundary_contracts` | `NOT_READY` | Canonical unit equality lacks a grammar sufficient for language-level overloads and non-symbol anchors. |
| `control_lifecycle` | `NOT_READY` | Packet comparison cannot reject or normalize malformed identity before relation comparison. |
| `verification_observability` | `READY_WITH_NOTES` | r02 fixtures cover different labels, but require collision and path-normalization cases. |
| `implementation_readiness` | `NOT_READY` | The future packet/table renderer has no exact field contract for UnitKey normalization. |
| `artifact_chain` | `READY_WITH_NOTES` | The new key concept is consistent, but requirements, design, terminology, and spec need the same grammar. |

## Findings

### Blocking

| ID | Category | Finding and evidence | Required correction |
|---|---|---|---|
| RCC-R03-F12 | correctness / compatibility / control-flow | The design defines UnitKey as `<normalized-relative-path>#<anchor-kind>:<anchor-value>` but does not define normalization or uniqueness. The example `symbol:Foo::bar` collides for overloaded functions, and hunk, heading, key, field, and table-row anchors have no canonical grammar. Independent packets can therefore still produce false matches or false gaps. | Define UnitKey as a canonical tuple carried in explicit table columns: `UnitPath`, `AnchorKind`, and `AnchorValue`. Normalize UnitPath as target-tree-relative, `/`-separated, exact-case, and without `.` or `..`. Define allowed anchor kinds and unique values: language-aware fully qualified declaration signature for symbols; normalized heading/key/field/row identity; and base/head range plus ordinal for hunks. Reject duplicates or malformed tuples as `UNIT_IDENTITY_GAP`. Update the example and fixture scenarios. |

### Should Fix

| ID | Category | Finding and evidence | Recommended correction |
|---|---|---|---|
| RCC-R03-F13 | evidence / artifact-chain | Requirements require reviewer and verifier to expand rule-source seeds, but the reviewer ledger and Comparison Packet do not require observed rule-source evidence. The verifier cannot distinguish a reviewer source expansion from missing documentation. | Add a compact Observed Rule Sources table or equivalent evidence section to reviewer output, keyed by RuleSourceRef and RuleVersionRef. Include it in Comparison Packet and compare it with Expected Coverage Packet source inventory. |

## Evidence Checked

- Corrected requirements, research, proposal, design, terminology, tasks, and
  behavioral delta spec.
- r02 review disposition and corrected gate/identity contracts.
- Current `planning-reviewer` anchor guidance, `review-packet-gate`, workflow
  control, static subagent projection, and validation behavior.
- `node bin/harness-change-validate.js --state-root . --change review-coverage-contract --strict-layout`: pass, zero errors and zero warnings before r03.

## Required Next Action

1. Correct RCC-R03-F12 and RCC-R03-F13 in all owning artifacts and examples.
2. Add overload, path-normalization, malformed-key, and observed-rule-source
   fixture scenarios.
3. Run draft-r04 challenge and multi-lens re-review before freeze.

## Re-review Criteria

- Independent agents use identical explicit tuple fields for the same semantic
  target and cannot silently merge overloaded symbols.
- Hunk and non-code anchor values are deterministic under a named fingerprint.
- Reviewer observed rule-source evidence is comparable with expected inventory.
- Unit identity failures have an explicit gap category and validation scenario.
