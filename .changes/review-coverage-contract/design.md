---
artifact: design
status: frozen
tags: [design, workflow, review, review-coverage, review-verification, rule-profile]
description: "Draft design for review target packets, coverage ledgers, independent verification, and coverage gates."
---

# Design

## Boundary

This change adds a review-coverage subprotocol to the existing evidence-gated
workflow. It does not replace baseline review, implementation verification,
council handling, project overlays, or change-workspace ownership.

The protocol is generic. Target repositories supply active rules, design
invariants, build commands, and domain-specific review lenses through their
instruction hierarchy and owned artifacts. Coverage claims are always relative
to a named target fingerprint, discovery method, rule-source inventory, and
coverage mode.

V1 uses normalized Markdown packets and tables. It does not add a parser,
serialized schema, new top-level artifact root, or parallel workflow skill.

## Assurance Model

The protocol separates four decisions:

1. `coverage_gate`: whether scope, rule sources, canonical unit-rule relations,
   evidence, and staleness are sufficiently covered for the selected mode;
2. `review_gate`: whether correctness findings permit the change to proceed;
3. `implementation_verification_gate`: whether tests, builds, static checks,
   runtime checks, or source evidence passed;
4. `overall_gate`: coordinator synthesis of all required decisions.

Coverage readiness is not defect freedom. A complete review that finds a severe
bug may have `coverage_gate=READY`, `review_gate=NOT_READY`, and
`overall_gate=NOT_READY`.

## Control Flow

1. The coordinator resolves the Portable Target Fingerprint and any optional
   Execution Coordinates.
2. The coordinator constructs a neutral Review Target Packet containing scope
   and rule-source seeds plus a discovery policy.
3. The reviewer validates or expands scope and rule-source seeds, performs
   baseline review, and returns findings, Unit Inventory, Rule Results, and
   Observed Rule Sources.
4. In deep mode, verifier phase 1 independently enumerates rule sources,
   expected units, and expected canonical unit-rule relations without reviewer
   output.
5. Phase 1 emits an immutable Expected Coverage Packet bound to the target
   fingerprint and its own content digest.
6. The coordinator creates a Comparison Packet containing the Expected Coverage
   Packet and reviewer ledger.
7. Verifier phase 2 may run in the same or a fresh verifier. It checks packet and
   target fingerprints before comparing expected and observed coverage.
8. The verifier emits a coverage report and `coverage_gate`; the reviewer emits
   findings and a `review_gate` recommendation.
9. The coordinator composes the overall review decision, then the workflow runs
   implementation verification and updates `overall_gate`.

Phase 1 may run in parallel with reviewer execution. No step depends on a client
being able to pause, hide later input, or resume the same agent.

## Component Responsibilities

| Component | Responsibility | Explicit Boundary |
|---|---|---|
| Coordinator/delegator | Resolve target, construct neutral packet, select mode, pair phase packets, and synthesize overall gate. | Does not prescribe expected findings or self-certify deep coverage. |
| Reviewer | Perform evidence-first correctness review and produce Unit Inventory, Rule Results, Observed Rule Sources, findings, and review-gate recommendation. | Does not claim independent coverage or defect freedom. |
| Review verifier | In inventory mode, derive expected coverage; in compare mode, compare immutable packets and emit coverage gaps. | Read-only; does not patch code, own overall gate, or replace full correctness re-review. |
| Review packet gate | Own packet minimums, normalized table contracts, gap taxonomy, and assurance-labeled gate semantics. | Does not own project-specific rules or client orchestration. |
| Workflow control | Route modes and order review coverage, correctness review, and implementation verification. | Does not duplicate reviewer or verifier analysis. |

## Portable Target Fingerprint

The target fingerprint is durable review identity.

### Committed Target

Record:

- repository identity or canonical root reference;
- base revision;
- head revision;
- submodule or external source revisions when included in scope;
- explicitly excluded generated or external inputs.

### Uncommitted Target

Record a base revision plus a deterministic digest over:

- staged diff content;
- unstaged diff content;
- sorted scoped untracked relative paths and file content;
- generated or ignored content explicitly included in review;
- exclusions with reasons.

The implementation-design phase must select the exact digest procedure and
cross-platform command path. Until then, a review packet that cannot reproduce
the fingerprint is `NOT_READY` for deep coverage.

### Non-Git Artifact Target

Use stable artifact identity plus a content digest and upstream source reference.

## Execution Coordinates

Execution Coordinates help agents locate the target but are not portable
identity:

- `state_root` and active change when a regulated workspace exists;
- `code_root` where source commands run;
- branch and worktree when relevant;
- local projection or generated-output roots when reviewed.

These fields are conditional. Generic review outside a change workspace does
not invent `state_root` or active change values. Persisted evidence uses target
fingerprints and change-relative references instead of relying on local worktree
paths.

## Review Target Packet

Required fields:

| Field | Meaning |
|---|---|
| `target_fingerprint` | Portable committed, uncommitted, or artifact identity. |
| `execution_coordinates` | Optional local roots, active change, branch, and worktree. |
| `intent` | Requested behavior and accepted requirement/design source. |
| `invariants` | Behavior, contract, compatibility, persistence, error, logging, security, or other properties that must hold. |
| `non_goals` | Explicitly excluded behavior and surfaces. |
| `scope_seed` | Changed files, planned files, symbols, task commits, artifacts, and known consumers. |
| `exclusions` | Excluded files, commits, generated surfaces, or rules with reasons. |
| `rule_source_seed` | Known active global, repository, skill, design, and task-level sources. |
| `discovery_policy` | Repository/client-owned roots and precedence rules the verifier must enumerate. |
| `coverage_mode` | `quick`, `standard`, or `deep`, trigger reason, and any override. |
| `validation_evidence` | Checks already run and known evidence gaps. |
| `known_risks` | Residual or accepted risks that must travel into review. |

The packet is neutral. `scope_seed` and `rule_source_seed` are claims to expand,
not completeness authority. Missing target fingerprint, intended behavior,
design source, discovery policy, or validation expectation makes deep review
`NOT_READY` before dispatch.

## Rule Source Inventory

Verifier phase 1 records every source discoverable through the packet's
discovery policy and current repository/client context.

| Field | Meaning |
|---|---|
| `SourceId` | Local stable source identifier. |
| `SourceRef` | Path, package, projection, artifact, or instruction source. |
| `Authority` | Instruction precedence or design/task ownership. |
| `VersionRef` | Git object, package version, projection hash, or content digest. |
| `Availability` | `available`, `unavailable`, or `partial`. |
| `Disposition` | `included`, `excluded-with-reason`, or `needs-context`. |
| `EvidenceRef` | How source presence, version, and applicability were established. |

Discovery policy should include, when available:

- effective repository instruction files and their scope chain;
- repository-owned review rules and selected skills;
- accepted requirements, design, task slice, and non-goals;
- canonical and projected reviewer/verifier role instructions;
- client or user-global instructions materialized into the delegation context.

Hidden or unavailable instruction sources cannot be verified. A required
unavailable source blocks `coverage_gate=READY`; an explicitly non-required
limitation may produce `READY_WITH_NOTES` with owner and reason.

RuleSourceRef uses the same path normalization as UnitPath, followed by a stable
section or key anchor. Package, projection, and non-file sources use their
canonical package or projection identity plus an equivalent section/key anchor.
RuleId is a stable core catalog ID where core owns one; otherwise it is the
normalized source-local section/key identity, including occurrence ordinal where
duplicate source anchors are legal. Opaque, agent-invented shorthand is not a
valid cross-packet rule identity.

## Review Profile And RuleRef

The Review Profile is derived from included Rule Source Inventory entries. It
contains baseline and risk-triggered review rules, applicability triggers,
surface tags, expected evidence, and precedence.

`RuleRef` is a structured record. Rule equality is exact equality of all three
fields after source-reference normalization:

| Field | Meaning |
|---|---|
| `rule_id` | Stable core catalog ID or source-local logical ID. |
| `source_ref` | Source path/package/artifact plus section or key. |
| `version_ref` | `git:<object>`, `package:<version>`, `projection:<sha256>`, or `content:<sha256>`. |

A core catalog ID is optional; a source and version are not. This covers
repository, installed, generated, and uncommitted rules without requiring a
global catalog.

Baseline correctness, scope alignment, consumer completeness, validation gaps,
and residual risk apply broadly. Security, concurrency, persistence, migration,
lifecycle, compatibility, or other specialist rules are added only when target
surfaces trigger them.

## Coverage Units

A Coverage Unit is the smallest reviewable semantic area whose purpose,
dependencies, applicable rules, evidence, and inclusion can be explained
together.

Allowed unit forms include:

- class, function, method, key block, or diff hunk;
- configuration key, schema field, command route, or serialized contract;
- caller, callee, consumer, importer, generated projection, or paired document;
- test case or validation seam;
- grouped trivial units sharing one purpose, rule set, disposition, count, and
  representative evidence.

`UnitKey` is the canonical cross-packet tuple:

| Field | Normalization rule |
|---|---|
| `UnitPath` | Target-tree-relative path, `/`-separated, exact target-tree casing, and no empty, `.` or `..` segment. |
| `AnchorKind` | One of `file`, `symbol`, `heading`, `key`, `field`, `table-row`, `hunk`, or another profile-defined kind recorded in the packet. |
| `AnchorValue` | Unique normalized value for the chosen kind. |

The packet target fingerprint binds the tuple to a specific content state. Anchor
values must follow these minimum rules:

- `symbol`: language-aware fully qualified declaration signature, including
  overload-disambiguating parameters, receiver, or template data when supported;
  use `hunk` when a stable semantic signature is unavailable.
- `heading`: normalized full heading ancestry plus occurrence ordinal.
- `key` and `field`: normalized key path plus occurrence ordinal when duplicate
  keys are legal.
- `table-row`: stable row key, or normalized header plus occurrence ordinal.
- `hunk`: base range, head range, and ordinal under the target fingerprint.
- `file`: the fixed value `.` for whole-file coverage.

A human-readable `UnitRef` may add line ranges or navigation detail, but it is
not compared across packets. Duplicate, malformed, or ambiguous UnitKey tuples
produce `UNIT_IDENTITY_GAP` rather than an inferred match.

## Reviewer Ledger

V1 uses three normalized Markdown tables. UnitKey is carried as explicit tuple
columns rather than a serialized shorthand.

### Unit Inventory

| Field | Meaning |
|---|---|
| `UnitPath` | Canonical path component of UnitKey. |
| `AnchorKind` | Canonical kind component of UnitKey. |
| `AnchorValue` | Canonical value component of UnitKey. |
| `UnitRef` | Optional human-readable target-bound navigation reference. |
| `Purpose` | Why the unit exists or matters to the change. |
| `SurfaceTags` | Risk tags used to select rules. |
| `DependencyRefs` | Callers, consumers, contracts, tests, or generated surfaces inspected with the unit. |
| `InclusionSource` | Packet seed, reviewer expansion, or verifier expectation. |

### Rule Results

| Field | Meaning |
|---|---|
| `UnitPath` | Canonical path component from Unit Inventory. |
| `AnchorKind` | Canonical kind component from Unit Inventory. |
| `AnchorValue` | Canonical value component from Unit Inventory. |
| `RuleId` | RuleRef `rule_id`. |
| `RuleSourceRef` | RuleRef `source_ref`. |
| `RuleVersionRef` | RuleRef `version_ref`. |
| `Applicability` | `applicable`, `not-applicable`, or `unknown`. |
| `Disposition` | `pass`, `finding`, `n/a`, `needs-context`, or `skipped-with-reason`. |
| `EvidenceRefs` | Source, caller, test, artifact, or command evidence for this relation. |
| `FindingRefs` | Finding identifiers produced by this relation. |
| `Notes` | N/A reason, skip reason, uncertainty, or concise conclusion. |

Rules selected for a UnitKey tuple by profile triggers require a Rule Results row. An
N/A decision is represented by `Applicability=not-applicable` and
`Disposition=n/a` with evidence and reason. Unit-level summaries are derived
output and cannot replace relation rows.

### Observed Rule Sources

| Field | Meaning |
|---|---|
| `RuleSourceRef` | Normalized source reference used by reviewer rule expansion. |
| `RuleVersionRef` | Version reference observed by reviewer. |
| `Disposition` | `used`, `excluded-with-reason`, or `needs-context`. |
| `EvidenceRefs` | Evidence that source was present, readable, and used or excluded. |
| `Notes` | Scope, precedence, limitation, or exclusion reason. |

Observed Rule Sources is compact evidence, not a replacement for the verifier's
independent Rule Source Inventory. It makes reviewer source expansion comparable
with phase-1 expectation.

### Example

Unit Inventory:

| UnitPath | AnchorKind | AnchorValue | UnitRef | Purpose | SurfaceTags | DependencyRefs | InclusionSource |
|---|---|---|---|---|---|---|---|
| `src/xxxx.cpp` | symbol | `Foo::bar(int retry_count)` | `src/xxxx.cpp:Foo::bar(int)@target-42` | Apply retry-exhaustion behavior. | lifecycle, error-handling | `Foo::run`, `foo_failure_test` | packet seed |

Rule Results:

| UnitPath | AnchorKind | AnchorValue | RuleId | RuleSourceRef | RuleVersionRef | Applicability | Disposition | EvidenceRefs | FindingRefs | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| `src/xxxx.cpp` | symbol | `Foo::bar(int retry_count)` | R-COR-02 | `rules/review.md#correctness` | `git:4f3a9c1` | applicable | pass | `Foo::run` | - | Control flow matches accepted retry design. |
| `src/xxxx.cpp` | symbol | `Foo::bar(int retry_count)` | R-ERR-01 | `rules/review.md#error-handling` | `git:4f3a9c1` | applicable | finding | `foo_failure_test` | F-003 | Exhausted retry loses the original error. |
| `src/xxxx.cpp` | symbol | `Foo::bar(int retry_count)` | R-SIM-03 | `rules/review.md#simplicity` | `git:4f3a9c1` | applicable | pass | `Foo::bar` | - | Existing retry helper is reused. |
| `src/xxxx.cpp` | symbol | `Foo::bar(int retry_count)` | R-CONC-01 | `rules/review.md#concurrency` | `git:4f3a9c1` | not-applicable | n/a | `Foo::run` | - | Caller executes synchronously with no shared mutable state. |

Observed Rule Sources:

| RuleSourceRef | RuleVersionRef | Disposition | EvidenceRefs | Notes |
|---|---|---|---|---|
| `rules/review.md` | `git:4f3a9c1` | used | `rules/review.md#correctness` | Provides baseline correctness, error, simplicity, and concurrency rules. |

The line range may appear inside EvidenceRefs for navigation but does not replace
the canonical UnitKey tuple.

## Expected Coverage Packet

Verifier phase 1 outputs:

| Field | Meaning |
|---|---|
| `PacketId` | Unique local packet identifier. |
| `TargetFingerprint` | Exact target identity used for inventory. |
| `CoverageMode` | Must be `deep` for independent verification. |
| `RuleSourceInventory` | Independently discovered source closure and limitations. |
| `ExpectedUnitInventory` | Units expected from diff and impact discovery. |
| `ExpectedRuleRelations` | UnitPath, AnchorKind, AnchorValue, RuleId, RuleSourceRef, and RuleVersionRef relations selected by profile triggers. |
| `ExclusionsAndUnknowns` | Explicit exclusions, unavailable sources, and unresolved context. |
| `PacketDigest` | Content digest recorded after phase 1 output is fixed. |

The packet is immutable input to comparison. If its target fingerprint or digest
does not match, phase 2 returns `STALE_REVIEW` or `NOT_READY` rather than silently
rebuilding expectations after seeing reviewer output.

## Comparison Packet

The coordinator supplies:

- Expected Coverage Packet and digest;
- reviewer Unit Inventory, Rule Results, and Observed Rule Sources;
- reviewer findings and `review_gate` recommendation;
- reviewer target fingerprint;
- prior review finding dispositions when this is re-review.

Phase 2 may run in the same verifier or a fresh verifier. All required context is
inside the packet, so behavior does not depend on client session continuity.

## Review Verifier Algorithm

### Inventory Mode

1. Confirm target fingerprint and optional execution coordinates.
2. Enumerate Rule Source Inventory from discovery policy and current evidence.
3. Derive expected changed units from the target, not only the packet file list.
4. Derive adjacent units from contracts, callers, consumers, projections,
   configuration, tests, and paired documentation justified by target surfaces.
5. Resolve the Review Profile and expected canonical unit-rule relations.
6. Emit and seal the Expected Coverage Packet before reviewer output is supplied.

### Compare Mode

1. Verify target and Expected Coverage Packet digests.
2. Validate UnitPath, AnchorKind, and AnchorValue normalization before matching.
3. Compute expected UnitKey tuples absent from reviewer Unit Inventory.
4. Compute required UnitKey-plus-rule tuples absent from Rule Results.
5. Compare Rule Source Inventory with reviewer Observed Rule Sources.
6. Inspect N/A and skipped reasons for applicability and evidence.
7. Verify findings and pass claims link to relevant relation evidence.
8. Accept justified reviewer expansions or report unexplained extras.
9. Report conclusion disagreement separately from coverage omission.
10. Emit a coverage report and assurance-labeled `coverage_gate`.

## Gap Taxonomy

| Gap | Meaning |
|---|---|
| `UNIT_IDENTITY_GAP` | UnitKey tuple is absent, malformed, duplicated, ambiguous, or cannot match the target-bound semantic unit. |
| `CODE_SCOPE_GAP` | Expected changed or impacted UnitKey tuple is absent. |
| `RULE_SOURCE_GAP` | Discoverable required source is absent, unavailable without disposition, or version-ambiguous. |
| `RULE_COVERAGE_GAP` | Expected UnitKey-plus-rule tuple has no result. |
| `APPLICABILITY_GAP` | N/A or skipped result lacks sufficient reason or evidence. |
| `EVIDENCE_GAP` | A relation conclusion is unsupported or evidence does not match. |
| `STALE_REVIEW` | Target fingerprint, packet digest, UnitKey, RuleRef, or material dependency changed. |
| `CONCLUSION_CONFLICT` | Verifier evidence directly disagrees with reviewer outcome. |
| `NEEDS_CONTEXT` | Owner intent, source authority, or applicability cannot be resolved. |

## Coverage Modes

| Mode | Eligibility or trigger | Output and assurance owner |
|---|---|---|
| `quick` | Only low-risk mechanical or documentation changes with directly enumerable scope, no behavior or contract change, and obvious validation. Any uncertainty escalates. | Coordinator summary; no independent completeness claim. |
| `standard` | Default normal behavior change without a deep trigger. | Reviewer ledger plus coordinator audit; relative semantic coverage, not independent completeness. |
| `deep` | Explicit exhaustive or independent review; security/trust boundary; destructive/data-loss behavior; public/serialized contract; persistence/migration; concurrency/lifecycle; unresolved cross-module impact; prior conflict. | Expected Coverage Packet, Comparison Packet, verifier coverage report, and deep coverage gate. |

The coordinator may escalate any mode. A mandatory deep trigger may be
downgraded only by an owner decision that records reason, evidence, and residual
risk. The resulting `coverage_gate` is at most `READY_WITH_NOTES` and states the
lower assurance actually performed.

## Gate Semantics And Composition

Every decision uses shared vocabulary plus `assurance`, `coverage_mode`, and
`target_fingerprint` where applicable.

### Coverage Gate

- `READY`: no blocking scope, source, relation, evidence, or staleness gap remains
  for the selected mode.
- `READY_WITH_NOTES`: coverage is sufficient but named limitations, exclusions,
  unavailable non-required sources, or lower assurance must travel forward.
- `NOT_READY`: required expected inventory, relation, evidence, source, or target
  identity is unresolved.
- `NEEDS_USER_DECISION`: source applicability or accepted assurance depends on
  owner intent.

### Review Gate

The reviewer uses existing finding semantics. Blocking correctness, safety,
scope-alignment, consumer-completeness, or validation-gap findings produce
`review_gate=NOT_READY` even when coverage is complete.

### Implementation Verification Gate

Tests, builds, static checks, runtime checks, or source evidence decide this gate
after review. A failure does not rewrite prior coverage evidence; it prevents the
overall change from proceeding.

### Overall Gate

The coordinator composes all gates:

- objective blocker in any required gate -> `NOT_READY`;
- owner intent required to determine a gate -> `NEEDS_USER_DECISION`;
- high-risk independent evidence conflict -> coordinator-only `NEEDS_COUNCIL`;
- no blockers but any carried note -> `READY_WITH_NOTES`;
- all required gates ready with no notes -> `READY`.

## Revision And Re-review

- Commit review binds to base and head revisions.
- Uncommitted review binds to base revision plus reproducible content digest.
- Rule source version changes invalidate affected Rule Results.
- Unit or material dependency changes invalidate affected Unit Inventory and
  relation rows.
- Re-review first dispositions prior findings, then inventories the new delta and
  any newly impacted surfaces.
- Unchanged rows may be carried forward only when target, UnitKey, RuleRef,
  evidence, and relevant dependencies remain valid.

## Persistence

- Keep quick and routine standard ledgers in-session.
- Persist deep review packets and ledgers for formal gate, re-review, council, or
  freeze evidence when the repository owns a change workspace.
- Do not create a separate top-level ledger root or mandatory process log.
- Use `.changes/<change>/reviews/` indexes when persistence is warranted.
- Persist portable fingerprints and change-relative references; local Execution
  Coordinates remain advisory context.

## Failure Handling

- Missing or irreproducible target fingerprint: `NOT_READY` before deep dispatch.
- Ambiguous or unavailable required rule source: `NOT_READY` or
  `NEEDS_USER_DECISION`; never silent omission.
- Expected packet digest mismatch: reject comparison as stale.
- Oversized ledger: narrow the target or group only trivial units sharing
  purpose, expected rules, evidence shape, and disposition.
- Verifier disagreement: preserve both evidence sets; coordinator triages and
  escalates only when high-risk conflict remains.
- Failed implementation validation after coverage-ready review: preserve the
  coverage result and set implementation-verification and overall gates to
  `NOT_READY`.

## Detailed Design Index

| Concern | Likely owner |
|---|---|
| Packet, source inventory, profile, normalized tables, gaps, and coverage gate | `skills/review/review-packet-gate/SKILL.md` |
| Reviewer conditional ledger and review-gate output | `agents/roles/reviewer.md` |
| Deep inventory/compare authority and output | new `agents/roles/review-verifier.md` |
| Workflow ordering, mode routing, and overall composition | `skills/workflow/workflow-control/SKILL.md`, `commands/harness/review.md`, `commands/harness/workflow.md` |
| Agent registration and four-client projection | `harness.manifest.json`, `lib/project/projector.js` existing route |
| Contract, fixture, and projection tests | `tests/test-skills.js`, `tests/test-subagents-hooks.js`, `tests/test-projection.js`, plus implementation-design-selected fixtures |

## New Role Justification

The deep-mode verifier has a distinct mission from `reviewer`:

- it audits completeness rather than leading with correctness findings;
- inventory mode must not receive reviewer output;
- compare mode consumes immutable expected coverage and reviewer ledger packets;
- it does not edit, own the overall decision, or perform a full second review by
  default.

Reusing `reviewer` would mix correctness and meta-coverage authority and weaken
neutral dispatch. A dedicated role is therefore justified for deep mode only.

## Implementation-Design Trigger Assessment

An implementation-design pack is required before task slicing. The selected
direction crosses workflow, review skill, subagent role, manifest, client
projection, commands, and tests with dependency-order and packet-contract risk.

The pack must define:

- canonical source owners and dependency order;
- role authority and projection path;
- exact Markdown packet/table shapes;
- target fingerprint procedure;
- fixture and fresh-agent evaluation ownership;
- compatibility and rollback seams.

## Validation Design

Implementation validation must include:

| Case | Expected evidence |
|---|---|
| Changed unit omitted from reviewer inventory | `CODE_SCOPE_GAP` fixture and forward-evaluation result. |
| Same unit receives different local display labels | Matching UnitPath, AnchorKind, and AnchorValue compare as one unit. |
| Overloaded symbol or duplicate heading lacks a unique anchor value | `UNIT_IDENTITY_GAP`. |
| Path contains non-normalized separator, casing, `.` or `..` segment | `UNIT_IDENTITY_GAP`. |
| Required rule source omitted from packet seed | Phase 1 includes it from discovery policy or reports `RULE_SOURCE_GAP`. |
| Reviewer uses or excludes a rule source | Observed Rule Sources matches expected source/version or reports a source gap. |
| Unit present but one canonical rule tuple result missing | `RULE_COVERAGE_GAP`. |
| N/A lacks applicability evidence | `APPLICABILITY_GAP`. |
| Target or expected-packet digest changes | `STALE_REVIEW`. |
| Coverage complete but blocking code defect found | `coverage_gate=READY`, `review_gate=NOT_READY`, `overall_gate=NOT_READY`. |
| Mandatory deep review downgraded | Owner decision present and coverage at most `READY_WITH_NOTES`. |
| New role projection | Canonical body, read-only authority, and packet fields preserved for Codex, Claude, OpenCode, and OMP. |
| Existing review without coverage mode | Existing findings-first behavior remains valid. |

Static tests verify owned text, fixtures, manifest, and projection. At least one
fresh-agent evaluation must verify planted omission detection without giving
phase 1 prior findings. Unsupported client execution is reported as a residual
limitation, not silently treated as passed behavior.
