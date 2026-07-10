---
artifact: terminology
status: frozen
tags: [terminology, review-coverage, review-verification, rule-profile]
description: "Terms for review coverage, rule applicability, and independent verification."
---
# Terminology

## Terms

| Term | Meaning | Scope |
|---|---|---|
| Review Target Packet | Neutral delegation input containing target fingerprint, intent, invariants, scope and rule-source seeds, discovery policy, validation evidence, and risk context. | Input contract shared by coordinator, reviewer, and verifier. |
| Portable Target Fingerprint | Durable identity for committed, uncommitted, or generated review content; independent of a local worktree path. | Review and re-review identity. |
| Execution Coordinates | Optional `state_root`, `code_root`, active change, branch, worktree, or projection roots used to locate local work. | Local execution and diagnostics only. |
| Scope Seed | Delegator-provided starting set of files, symbols, commits, artifacts, consumers, and exclusions; not proof of complete scope. | Review Target Packet. |
| Rule Source Seed | Delegator-provided starting list of known active rule sources; not proof of source closure. | Review Target Packet. |
| Discovery Policy | Repository/client-owned roots and precedence rules used to enumerate discoverable review sources and impacted code. | Deep verifier inventory mode. |
| Rule Source Inventory | Independently recorded sources, authority, version, availability, disposition, and evidence that bound the discoverable rule universe. | Expected Coverage Packet. |
| Review Profile | Baseline and risk-triggered rules derived from included Rule Source Inventory entries. | Reviewer and verifier rule selection. |
| RuleRef | Structured rule identity containing `rule_id`, normalized `source_ref` with stable anchor, and `version_ref`. | Review Profile and Rule Results. |
| Coverage Unit | Smallest semantic area whose purpose, dependencies, rule selection, evidence, and inclusion can be reviewed together. | Unit Inventory. |
| UnitKey | Canonical cross-packet tuple of UnitPath, AnchorKind, and AnchorValue under the packet target fingerprint. | Expected and reviewer coverage comparison. |
| UnitPath | Target-tree-relative, `/`-separated, exact-case path with no `.` or `..` segment. | UnitKey tuple. |
| AnchorKind | Canonical unit anchor category such as file, symbol, heading, key, field, table-row, or hunk. | UnitKey tuple. |
| AnchorValue | Unique normalized value for an AnchorKind, including overload-disambiguating symbol signatures and ordinals where needed. | UnitKey tuple. |
| UnitRef | Optional human-readable source navigation reference that may add line ranges but cannot replace UnitKey. | Unit Inventory and reports. |
| Unit Inventory | Normalized table of reviewed or expected Coverage Units keyed by UnitKey, plus dependencies, surface tags, and inclusion sources. | Reviewer ledger and Expected Coverage Packet. |
| Rule Result | One UnitKey tuple plus flattened RuleId, RuleSourceRef, RuleVersionRef, applicability, disposition, evidence, finding links, and notes. | Reviewer Rule Results table. |
| Observed Rule Sources | Compact reviewer evidence that a normalized rule source/version was used, excluded, or unresolved. | Reviewer ledger and Comparison Packet. |
| Review Coverage Ledger | Reviewer-produced Unit Inventory plus Rule Results, findings, exclusions, uncovered items, and target fingerprint. | Reviewer output. |
| Expected Coverage Packet | Immutable deep-mode phase-1 output containing target fingerprint, Rule Source Inventory, expected UnitKey-plus-rule tuples, limitations, and packet digest. | Verifier inventory output. |
| Comparison Packet | Phase-2 input containing the Expected Coverage Packet and reviewer ledger bound to the same target. | Verifier compare input. |
| Review Verifier | Read-only deep-mode role that independently inventories expected coverage and compares immutable packets. | Deep review coverage mode. |
| Coverage Mode | Proportional assurance level: `quick`, `standard`, or `deep`. | Routing and gate policy. |
| Applicability | Whether a rule tuple is `applicable`, `not-applicable`, or `unknown` for one UnitKey. | Rule Result. |
| Disposition | Result for one UnitKey-plus-rule tuple: pass, finding, n/a, needs context, or skipped with reason. | Rule Result. |
| Coverage Gate | Decision about scope, source, relation, evidence, and staleness completeness for a named assurance mode. | Meta-review output. |
| Review Gate | Decision derived from correctness, safety, alignment, completeness, and validation findings. | Baseline reviewer output. |
| Implementation Verification Gate | Decision from tests, builds, static checks, runtime checks, or source evidence after review. | Existing workflow verification. |
| Overall Gate | Coordinator synthesis of coverage, review, implementation-verification, and owner/council decisions. | Workflow control. |
| Stale Review | Evidence whose target fingerprint, packet digest, UnitKey, RuleRef, or material dependency changed after review. | Re-review and gate invalidation. |
| Unit Identity Gap | A UnitKey that is absent, malformed, ambiguous, or cannot match a target-bound semantic unit. | Verifier gap taxonomy. |
