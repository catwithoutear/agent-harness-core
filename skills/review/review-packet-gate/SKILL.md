---
name: review-packet-gate
description: Use when preparing or judging review packets, gate decisions, re-review evidence, finding disposition, or readiness of a plan or implementation.
---

# Review Packet Gate

Review from evidence. A finding is valid only when it cites the changed
artifact, source path, design source, or command output that proves the risk.

## Packet

Require:

- scope under review,
- intended behavior,
- relevant design or requirement,
- diff or artifact paths,
- validation already run,
- scope-alignment evidence for the accepted requirement or design,
- changed contracts, consumers, or adjacent surfaces that must be complete,
- validation gaps and whether each gap is a finding or accepted residual risk,
- known residual risks.

Reject the packet as `NOT_READY` when the scope, intended behavior, source
artifact, or validation expectation is missing. Do not review a vague summary as
if it were the diff.

## Completeness Checks

For implementation review, distinguish:

- correctness findings: the changed behavior is wrong, unsafe, or regresses;
- scope-alignment findings: the implementation does not match the accepted
  requirement, design, or task slice;
- consumer completeness findings: shared contracts, importers, callers,
  projections, generated outputs, or paired documentation were not updated;
- validation-gap findings: required evidence is missing or weaker than the
  review gate claims;
- accepted residual risks: gaps explicitly carried forward with owner, reason,
  and follow-up path.

## Decision

Use the shared gate vocabulary:

- `READY`: no blocking finding remains.
- `READY_WITH_NOTES`: no blocker remains, but named residual notes must travel
  forward.
- `NOT_READY`: missing evidence, missing validation, unresolved finding, or
  unsafe scope.
- `NEEDS_USER_DECISION`: correctness depends on product, ownership, or policy
  intent that cannot be inferred from source evidence.
- `NEEDS_COUNCIL`: only the coordinator should emit this for high-risk
  independent evidence conflicts.

Specialist reviewers should recommend council escalation when needed, but the
coordinator owns the final `NEEDS_COUNCIL` decision.

## Minimal Example

Packet: "Review `skills/entry/ask-harness/SKILL.md`; intent is to improve skill
routing examples; tests added in `tests/test-skills.js`; `npm test` passed."

Decision: `READY_WITH_NOTES` when examples improve routing and no blocker
remains, but note that forward-testing with a fresh agent was not run.

If the packet only says "review the skill changes" with no diff path, intent, or
validation, return `NOT_READY`.

## Finding Rules

- Lead with bugs, regressions, safety risks, and missing validation.
- Order findings by severity.
- Include file path, line or section, observed evidence, and expected behavior.
- Separate confirmed findings from questions.
- Do not include style preference unless it creates a concrete maintenance or
  behavior risk.
- If the review is clean, state the remaining test gap or residual risk.

## Re-review

On re-review, do not repeat the first review blindly. For each prior finding,
state one of:

- resolved with evidence,
- still open,
- superseded by a different fix or requirement,
- deferred with owner and reason,
- false positive with evidence.

Then review the new diff introduced by the fix. Fixes can introduce new risks.

## Common Mistakes

- Approving because tests passed while the design requirement was not checked.
- Blocking on a preference without concrete risk.
- Accepting a packet that omits the changed artifact.
- Losing deferred findings during re-review.

## Coverage Protocol

Use this only when a coordinator explicitly provides `coverage_mode`. It
extends the existing findings-first review and does not replace correctness
review, implementation verification, council handling, or coordinator-owned
`overall_gate`. V1 is Markdown-only: it has no parser and no serialized schema.

Resolve the portable target with the skill-local, read-only helper before an
explicit mode review. It writes JSON to stdout only and never hashes local root
paths:

```text
node <review-packet-gate-skill-root>/scripts/review-packet-digest.mjs target \
  --kind git-worktree --code-root <path> --base <commit> [--head <commit>] \
  [--untracked-scope <path>]... [--include-path <path>]... \
  --declaration <utf8-file> --json

node <review-packet-gate-skill-root>/scripts/review-packet-digest.mjs target \
  --kind artifact-set --artifact-root <path> --include-path <path>... \
  --declaration <utf8-file> --json

node <review-packet-gate-skill-root>/scripts/review-packet-digest.mjs packet \
  --input <expected-packet.md> --json
```

The opaque declaration is valid UTF-8 without a BOM, LF-normalized, and reduced
to one final LF. Roles check its human semantics but never parse it. The packet
helper accepts one `PacketDigest: sha256:self` marker to calculate a seal, then
verifies a supplied digest. `TARGET_FINGERPRINT_UNAVAILABLE`,
`TARGET_RECOMPUTE_UNAVAILABLE`, `PACKET_SEAL_INVALID`, and
`PACKET_SEAL_MISMATCH` are fail-closed for deep coverage.

### Mode Routing

| Packet condition | Required output | Forbidden claim |
|---|---|---|
| No `coverage_mode` | Existing findings-first review and `review_gate` only. | `coverage_gate`, helper requirement, verifier dispatch, or coverage assurance. |
| `coverage_mode=quick` | Target identity, findings, and `review_gate`. | Independent completeness. |
| `coverage_mode=standard` | Target identity, findings, Unit Inventory, Rule Results, Observed Rule Sources, and coordinator audit. | Verifier-backed independent coverage. |
| `coverage_mode=deep` | Target identity, reviewer ledger, sealed Expected Coverage Packet, comparison report, and four gates. | Continuing after target, seal, or required-source failure. |

Deep is mandatory for explicit independent/exhaustive review, trust or security
boundaries, destructive behavior, public/serialized contracts, persistence or
migration, concurrency/lifecycle semantics, unresolved cross-module impact, or
reviewer conflict. A downgrade records the owner, reason, and residual risk;
its coverage result cannot be unqualified `READY`.

### Target Packet

All explicit modes begin with the following four blocks. Repeat every typed
argument in UTF-8 sorted order; Git with no scope writes
`--untracked-scope | .`, and inapplicable fields use `N/A`.

````text
# Review Target Packet

## Target Identity
TargetKind: <git-worktree|artifact-set>
FingerprintFormat: review-target-v1
DigestAlgorithm: sha256
HelperVersion: 1
TargetFingerprint: sha256:<digest>
GitObjectFormat: <sha1|sha256|N/A>
BaseRevision: <full-object-id|N/A>
HeadRevision: <full-object-id|N/A>

| Component | Digest | Summary |
|---|---|---|
| committed | sha256:<digest> | base/head identities or N/A |
| staged | sha256:<digest> | index records or N/A |
| unstaged | sha256:<digest> | worktree records or N/A |
| untracked | sha256:<digest> | selected scope or N/A |
| declared-inputs | sha256:<digest> | typed paths and declaration bytes |

## Target Input Arguments
| Option | Value |
|---|---|
| --untracked-scope | <normalized relative path or N/A> |
| --include-path | <normalized relative path or N/A> |

## Declared Inputs
DeclarationDigest: sha256:<digest>
```text
<verbatim declaration content>
```

## Execution Coordinates
CodeRoot: <local path or N/A>
ArtifactRoot: <local path or N/A>
DeclarationPath: <local path or N/A>
StateRoot: <local path or N/A>
ActiveChange: <change id or N/A>
````

The target blocks are portable except Execution Coordinates, which let a fresh
agent recompute the helper result. Seeds for scope and rule sources must be
expanded from current evidence; they are not completeness authority.

### Standard And Deep Ledger

In `coverage_mode=standard` or `coverage_mode=deep`, findings remain first and
these Markdown tables follow. Unit identity is the exact
`UnitPath`/`AnchorKind`/`AnchorValue` tuple. Rule identity is the exact
`RuleId`/`RuleSourceRef`/`RuleVersionRef` tuple; line ranges are only UnitRef
navigation detail.

#### Unit Inventory

| UnitPath | AnchorKind | AnchorValue | UnitRef | Purpose | SurfaceTags | DependencyRefs | InclusionSource |
|---|---|---|---|---|---|---|---|

#### Rule Results

| UnitPath | AnchorKind | AnchorValue | RuleId | RuleSourceRef | RuleVersionRef | Applicability | Disposition | EvidenceRefs | FindingRefs | Notes |
|---|---|---|---|---|---|---|---|---|---|---|

N/A means `Applicability=not-applicable`, `Disposition=n/a`, with evidence and
a reason. One unit summary cannot replace separate applicable-rule results.

#### Observed Rule Sources

| RuleSourceRef | RuleVersionRef | Disposition | EvidenceRefs | Notes |
|---|---|---|---|---|

### Deep Packets

The read-only verifier has two isolated dispatches:

```text
inventory: Review Target Packet + target fingerprint + discovery policy
compare: sealed Expected Coverage Packet + reviewer ledger + prior finding dispositions
```

Inventory receives no reviewer ledger, findings, or prior comparison. It copies
all four Target Packet blocks verbatim before sealing; a digest-only reference
is insufficient. The coordinator calculates the `PacketDigest: sha256:self`
value then reruns the helper to verify it.

````text
# Expected Coverage Packet
CoverageMode: deep
PacketDigest: sha256:self

## Target Identity
<verbatim copy of Target Identity, Target Input Arguments, Declared Inputs, and Execution Coordinates>

## Rule Source Inventory
| SourceId | SourceRef | Authority | VersionRef | Availability | Disposition | EvidenceRef |
|---|---|---|---|---|---|---|

## Expected Unit Inventory
| UnitPath | AnchorKind | AnchorValue | UnitRef | Purpose | SurfaceTags | DependencyRefs | InclusionSource |
|---|---|---|---|---|---|---|---|

## Expected Rule Relations
| UnitPath | AnchorKind | AnchorValue | RuleId | RuleSourceRef | RuleVersionRef | TriggerEvidence |
|---|---|---|---|---|---|---|
````

Comparison recomputes target and packet identities, preserves the reviewer
ledger, and emits this report:

````text
# Coverage Verification Report
CoverageMode: deep
TargetFingerprint: sha256:<digest>
ExpectedPacketDigest: sha256:<digest>

## Source Comparison
| RuleSourceRef | ExpectedVersionRef | ObservedVersionRef | Result | EvidenceRefs | Notes |
|---|---|---|---|---|---|

## Unit Comparison
| UnitPath | AnchorKind | AnchorValue | Result | EvidenceRefs | Notes |
|---|---|---|---|---|---|

## Rule Relation Comparison
| UnitPath | AnchorKind | AnchorValue | RuleId | RuleSourceRef | RuleVersionRef | Result | EvidenceRefs | Notes |
|---|---|---|---|---|---|---|---|

## Gap Report
| GapId | GapType | Ref | EvidenceRefs | Required Resolution |
|---|---|---|---|---|

## Coverage Gate
coverage_gate: <READY|READY_WITH_NOTES|NOT_READY|NEEDS_USER_DECISION>
assurance: independent-deep
````

Classify omissions as `CODE_SCOPE_GAP`, `RULE_SOURCE_GAP`,
`UNIT_IDENTITY_GAP`, `RULE_COVERAGE_GAP`, `APPLICABILITY_GAP`, `EVIDENCE_GAP`,
`STALE_REVIEW`, or `CONCLUSION_CONFLICT`, rather than a generic missing row.

### Separate Gates

| Gate | Owner | Meaning |
|---|---|---|
| `coverage_gate` | deep verifier or standard coordinator audit | Scope, sources, relations, evidence, and staleness are adequate for selected mode. |
| `review_gate` | reviewer | Correctness findings permit or block progress. |
| `implementation_verification_gate` | verification workflow | Tests, builds, and source/runtime checks pass independently. |
| `overall_gate` | coordinator | Synthesis of all required decisions. |

`coverage_gate=READY` can coexist with `review_gate=NOT_READY` when complete
coverage finds a defect. Later implementation verification failure preserves
coverage evidence but makes `implementation_verification_gate` and
`overall_gate` `NOT_READY`.

## Deterministic Fixtures

`tests/fixtures/review-coverage/deep-expected-gaps.md` records a complete
expected source/unit/relation universe. `deep-missing-relation.md` omits one
relation and its evidence, so comparison must report `RULE_COVERAGE_GAP` and
`EVIDENCE_GAP`. These fixtures prove protocol wiring, not model-general
omission detection; a fresh-agent run is separately bounded evidence.
