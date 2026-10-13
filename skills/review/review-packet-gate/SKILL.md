---
name: review-packet-gate
description: Use when preparing or judging review packets, gate decisions, re-review evidence, finding disposition, or readiness of a plan or implementation.
---

# Review Packet Gate

Review from evidence. A finding is valid only when it cites the changed
artifact, source path, design source, or command output that proves the risk.

## Review Scope

Use `workflow-control:Review Coverage` for complete task scope and shared
coverage duties. For code, `multi-lens-review` is the one normal code-review
procedure and supplies its code dimension families; invoke the applicable
project-native baseline. `multi-lens-design-review` owns design dimensions.
Enumerate assignments and evidence in the existing packet before judging
completeness. A focused specialist result cannot stand for the complete review;
missing source/mapping stays a gap and N/A requires checked evidence. Formal
closure of declared relations alone cannot prove the semantic dimension set
complete.

Use `workflow-control:Review Coverage` completion checks to accept
reuse/necessity coverage, including results from a separate simplification
pass. Findings, kept-block comparisons, and unsubstantiated coverage are
different outcomes; no reported defect is not a complete comparison.

For ordinary reviews, gather the target, diff, and available context yourself
before asking for missing input. Report source-proven defects even when design
intent or execution evidence is unavailable; qualify the conclusions that depend
on those gaps. A report is not formal gate approval or coverage assurance.

Use the formal review-run protocol only when requested or required by applicable
project policy. Optional fresh perspectives do not themselves require formal
coverage assurance. Never silently downgrade a required formal gate.

## Packet

For a formal readiness decision, require:

- scope under review;
- intended behavior;
- relevant design or requirement;
- diff or artifact paths;
- validation already run;
- scope-alignment evidence for the accepted requirement or design;
- changed contracts, consumers, or adjacent surfaces that must be complete;
- validation gaps and whether each gap is a finding or accepted residual risk;
- known residual risks.

Reject the packet as `NOT_READY` when the scope, intended behavior, source
artifact, or validation expectation is missing. Do not review a vague summary as
if it were the diff.

## Source Navigation and Acceptance

For ordinary filesystem-backed code review, including direct reviewer and
read-only simplification dispatch, prepare source navigation before launching
the first pass. Resolve the exact root and complete task target as usual; select
the target files and necessary interface, caller, contract and test context.
Run the existing target helper's source actions below. Put the immutable output
and invocation in the existing Review/Scope Packet, not a separate status store.
The root is explicit in the local invocation; portable receipts contain no root.

```text
node <review-packet-gate-skill-root>/scripts/review-target-digest.mjs source-snapshot \
  --code-root <resolved-root> --target-path <target-file-or-directory>... \
  --include-path <target-or-context-file-or-directory>... --json

node <same-helper> source-inventory --code-root <resolved-root> \
  --snapshot <saved-snapshot.json> [--prefix <relative-directory>] --json

node <same-helper> source-read --code-root <resolved-root> \
  --snapshot <saved-snapshot.json> --path <relative-file> \
  [--start <one-based-line>] [--end <one-based-line>] --json

node <same-helper> source-check --code-root <resolved-root> \
  --snapshot <saved-snapshot.json> --evidence <read-receipts-array.json> --json

node <same-helper> source-return --code-root <resolved-root> \
  --snapshot <saved-snapshot.json> --report <original-report> \
  --path <relative-file> --start <line> --end <line> \
  --claim <unsupported-premise> --invariant <fixed-behavior-or-comparison> --json
```

Capture stdout in the existing packet/evidence location. Use inventory to find
available dependencies instead of guessing names or leaving the selected root.
Read emits whole-file byte identity and exact numbered lines from one buffer;
save or reference the material receipts alongside the existing comparison.
Before accepting coverage, source-check verifies the delivered corpus is still
current and the cited receipts match its actual slices. Inspect its `status`,
`source_identity_verified` and named gaps; a successful command invocation alone
does not mean that evidence passed. An unavailable interface stays a gap; add
newly justified context through a new snapshot, retaining the prior one. After
authorized edits, likewise use a new current snapshot, not rewritten old proof.

Then execute `workflow-control:Review Coverage` acceptance on the actual claim
and final call. Source-check always leaves `semantics_verified=false`; it
cannot discover all necessary context, validate a copied probe's adaptations,
prove an API comparison, or establish that a reviewer loaded a skill. Compile
or exercise the actual candidate when that is needed to support the claim,
and retain substitution/coverage limits. Do not replace an exact call test
with a related mechanism or a quoted source fragment.

When a claim remains unsupported, source-return binds the original report hash,
exact block, premise and invariant for the existing bounded return procedure.
Keep the original report; the same assigned reviewer returns corrected evidence
or explicit unsubstantiated coverage. The coordinator rechecks it, rather than
rewriting reviewer-owned conclusions or treating the return artifact as approval.
Missing source, changed bytes and mismatched quotes cannot substantiate coverage.
Neither ordinary source receipts nor a return are formal protocol records.

These read-only helpers are navigation aids, not a filesystem sandbox. For
formal review-run, preserve Target Identity and the admitted provider target
view. Never give the isolated Phase-A lane a local root, snapshot, expected
comparison or return; broker-only reads and its closed schema remain mandatory.
Coordinator local source receipts do not replace any formal owner gate.

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

If the request says "review the skill changes", inspect the worktree and collect
available evidence first. Ask only if material target ambiguity remains. Missing
evidence can make formal approval `NOT_READY` without preventing a qualified
ordinary review report.

## Finding Rules

- Lead with bugs, regressions, safety risks, and missing validation.
- Order findings by severity.
- Include file path, line or section, observed evidence, and expected behavior.
- Separate confirmed findings from questions.
- Do not include style preference unless it creates a concrete maintenance or
  behavior risk.
- If the review is clean, state the remaining test gap or residual risk.

## Re-review

The coordinator reconciles prior findings from the owning review records and
their dispositions, including relevant nonblocking opportunities and
owner-withdrawn fixes. Preserve their identity across amendments, rebases and
scope changes; omission from a later clean report is not a disposition. Match
the finding's trigger, affected behavior and resolution evidence to the current
target, not merely an earlier tested fix or a different failure path.
Honor an explicit deferral or withdrawal: carry its owner, reason and remaining
risk without treating it as repaired or silently authorizing the deferred edit.
Keep this reconciliation in the existing Review Packet; do not feed prior
conclusions into isolated discovery lanes.

On re-review, do not repeat the first review blindly. For each prior finding,
state one of:

- resolved with evidence;
- still open;
- superseded by a different fix or requirement;
- deferred with owner and reason;
- false positive with evidence.

Then review the new diff introduced by the fix. Fixes can introduce new risks.

For MR findings, load `references/mr-finding-lifecycle.md`. Classify each as
`defect`, `project-style`, or `false`; keep `replied`, `modified`, `verified`,
and `reviewer_resolved` as independent states. A request to fix similar issues
requires complete-task-diff scan evidence, and every dispositioned finding is
screened for a detailed knowledge retrospective. Project-specific skills own
project semantics; this skill owns disposition evidence, review gating, and the
retrospective trigger.

## Common Mistakes

- Approving because tests passed while the design requirement was not checked.
- Blocking on a preference without concrete risk.
- Accepting a packet that omits the changed artifact.
- Losing deferred findings during re-review.

## Review-Run Protocol

This is the sole structured review protocol. It is selected by the exact
unversioned `protocol=review-run` field. Do not create a second route based on
assurance labels, Markdown shape, provider, or a reviewer assertion. Requests
that do not satisfy this contract fail closed; they are not reinterpreted as a
legacy review.

The coordinator persists one immutable dispatch contract before dispatch:

```json
{
  "contract_digest": "sha256:<digest>",
  "rules": [{"rule_id": "<id>", "source_ref": "<portable-ref>"}],
  "scope": ["<portable-scope>"],
  "dimensions": [{"dimension_id": "<id>"}],
  "relations": [{
    "relation_id": "<id>",
    "unit_key": {"unit_path": "<path>", "anchor_kind": "<kind>", "anchor_value": "<value>"},
    "dimension_id": "<id>",
    "rule_ref": {"rule_id": "<id>", "source_ref": "<ref>"}
  }]
}
```

The reviewer receives the dispatch digest, exact rules, scope, dimensions, and
target identity. The deep verifier Phase A receives only the machine-built
neutral packet described below, never the expected-lane dispatch. After both
lanes seal, Phase B may compare the dispatch and sealed reviewer evidence. Discovery may add a target-derived relation, but it may
not remove an assigned relation and every expansion must reference an assigned
rule source and dimension. A relation is identified by
`UnitKey + DimensionId + RuleRef`; a summary, narrative, or row count cannot
replace relation-level evidence.

### Target Identity

For a Git worktree or artifact set, resolve the portable target before
dispatch. The helper writes JSON to stdout and never persists local roots:

```text
node <review-packet-gate-skill-root>/scripts/review-target-digest.mjs target \
  --kind git-worktree --code-root <path> --base <commit> [--head <commit>] \
  [--untracked-scope <path>]... [--include-path <path>]... \
  --declaration <utf8-file> --json

node <review-packet-gate-skill-root>/scripts/review-target-digest.mjs target \
  --kind artifact-set --artifact-root <path> --include-path <path>... \
  --declaration <utf8-file> --json
```

The helper uses `fingerprint_format=review-target`, UTF-8 declarations with one
final LF, and fail-closed target errors. The result is evidence for the
request and discovery record, not a substitute for the dispatch contract.

### Isolated Dispatches

```text
reviewer: request + dispatch contract + target
  -> correctness findings + relation-level review-ledger

verifier inventory: request + dispatch contract + target
  -> sealed discovery + shard-plan

verifier compare: sealed discovery + shard closure + reviewer ledger
  -> coverage aggregate only

coordinator: aggregate + review result + implementation evidence
  -> durable gate-result
```

Inventory receives no reviewer ledger, findings, prior comparison, or
conclusion. The reviewer owns correctness findings and the verifier owns
coverage comparison. Neither role emits `overall_gate` or mutates the target.

For deep review, do not hand-author the Phase-A prompt. Accept the run only
after the provider has a current runtime conformance receipt and a complete
capability matrix, then extract the machine-built packet with
`review-run.mjs phase-a-packet`. Its closed schema binds the exact protocol,
run id, phase, target fingerprint, provider, target-view capability and
firewall policy. Unknown fields—including expected relations, dispatch,
ledger, findings or a prior conclusion—are contamination and fail closed. A
new run id does not sanitize an execution identity that already saw the
expected lane; the two lane attestations must prove distinct execution,
broker-token, read-log and result-channel identities.

### Relation Ledger

Every expected relation has exactly one explicit status: `covered`,
`not-covered`, or `not-applicable`. Each entry requires evidence;
`not-applicable` additionally requires reviewer authority and a rationale. It
can never be inferred from an omission. Missing, duplicate, unknown, stale, or
unassigned relations remain visible as typed gaps:
`RULE_SOURCE_GAP`, `UNIT_IDENTITY_GAP`, `RULE_COVERAGE_GAP`,
`APPLICABILITY_GAP`, `EVIDENCE_GAP`, `STALE_REVIEW`, and
`CONCLUSION_CONFLICT`.

For reuse/necessity relations, reviewer evidence must reference the compact
`Capability Comparison Evidence` owned by
`workflow-control/references/minimal-implementation.md`. Carry this authority
in the existing rule source and dimension mapping; use existing ledger
evidence references, not a new gate or parallel report. In Phase B, check that
the referenced evidence is available and addresses the assigned block; missing
or unrelated evidence is an `EVIDENCE_GAP`. Correctness of the comparison remains
the reviewer's responsibility, with coordinator acceptance under
`workflow-control:Review Coverage`. A coordinator-rejected comparison against
different behavior does not support `covered`; the reviewer must supply a
corrected comparison or record `not-covered`. Structural closure cannot
rehabilitate that result.
Do not disclose expected comparisons to
the isolated Phase-A lane.

The reviewer records a missing comparison as `not-covered`, not `covered`.
If Phase B finds that a claimed comparison is unavailable or unrelated, retain
that required difference and `independent_review_gate=NOT_READY` until the
reviewer supplies current evidence and the comparison closes. The coordinator
must consume that owner result; structural ledger closure cannot override it.

`validateLedger` checks identity, status and nonempty portable evidence
references; it does not read their targets or prove their semantic adequacy.
A machine-closed ledger cannot by itself certify capability discovery or a keep
reason. Preserve this limit when reporting `coverage_gate` and the final gate;
do not use a passing validator to override a known evidence gap.

Resolve coordinator acceptance returns before `append-attempt` seals the
reviewer ledger. Preserve the raw report and return with evidence references;
the reviewer supplies the terminal ledger, recording unresolved required
comparisons as `not-covered`. An execution may have succeeded while coverage
remains incomplete. If the reviewer has not returned, keep the admitted
attempt open and use its existing timeout/cancellation policy; do not synthesize
a successful ledger. A non-gating `coordinator_source_assessment` cannot stand
in for this owner response or close the gap.

If the ledger is already immutable, do not edit it or append an overlapping
successful retry: aggregation treats duplicate relations as gaps, not as a
newest-result selection. Finish an already recorded `not-covered` run with
`NOT_READY`, or invalidate an erroneously accepted run, and obtain corrected
owner evidence in a successor run. Preserve the prior report, rejection and
run lineage in the existing Review Packet. The filesystem lifecycle does not
validate this cross-run lineage; the coordinator checks those references.
Before consuming a gate, read the latest fenced control revision. An
`invalidated` run's old `READY` file is historical and must not authorize
progress; invalidation does not rewrite it. `completed` describes lifecycle
termination, not gate acceptance.
Recheck the returned comparison and current target before accepting the
successor; a new run id alone supplies no missing semantic evidence.

Discovery must be sealed before planning, and the sealed discovery plus shard
closure must exist before dispatch, comparison or aggregation. The runtime
state machine rejects skipped barriers. A failed child, unavailable source,
target mismatch, provider gap, expired attempt or unresolved boundary produces
`coverage_gate=NOT_READY` for deep review.

### Durable Lifecycle

Records are canonical JSON with a self-digest, portable relative references,
immutable parent lineage, and fenced control revisions. The regulated document
tool owns the run root:

```text
harness-change-doc --state-root <state-root> --code-root <code-root> \
  init-review-run <change> --run-id <request-id> --json
```

The protocol store owns child records below
`.changes/<change>/review-runs/<run-id>/`; validators are read-only. The
minimum lifecycle is:

```text
created -> discovering -> discovery-sealed -> planning -> dispatch-ready
        -> running -> aggregating -> completed | cancelled | invalidated
```

Use the machine transitions `discover`, `begin-planning`, `plan`, and
`dispatch`; do not combine discovery with shard planning in one unsealed agent
phase. Every request declares discovery, run, attempt, checkpoint, relation,
shard and retry budgets. Admit each reviewer before launch, record diagnostic
checkpoints, and sweep timeouts into typed failed ledgers. Diagnostic
checkpoints are explicitly ineligible for coverage and independent evidence.
Failed or cancelled attempts remain visible, retries are bounded, and terminal
cancelled/invalidated runs require a successor rather than same-run resume. A
completed or cancelled run has an aggregate report, including pre-dispatch
closure or cancellation failures.

### Separate Gates

| Gate | Owner | Meaning |
|---|---|---|
| `coverage_gate` | protocol aggregator | Scope, rules, dimensions, relations, evidence, and staleness are adequate; deep coverage is capped when independent discovery is not closed. |
| `review_gate` | reviewer | Correctness findings permit or block progress. |
| `independent_review_gate` | review-verifier | Fresh independent discovery and required comparison differences are closed. |
| `style_gate` | reviewer | Required changed-line style evidence is closed. |
| `implementation_verification_gate` | verification workflow | Tests, builds, and source/runtime checks pass independently. |
| `overall_gate` | coordinator | Synthesis of all required decisions. |

Every `gate-result` emits all five evidence gates plus `overall_gate`. The
aggregator accepts each non-coverage gate only from its declared owner, with a
canonical owner receipt and the required evidence kind (`review-ledger`,
`discovery-barrier`, `style-ledger`, or `verification-report`), and never
invents correctness or implementation results. A coordinator source
inspection travels separately as non-gating
`coordinator_source_assessment`; it cannot populate `review_gate`.
`overall_gate` is fail-closed when any required gate is absent or `NOT_READY`.

## Output Packets

Context packet:

- goal and non-goals;
- active change or explicit no-change reason;
- relevant source files and current state;
- constraints, risks, and owner questions;
- planned validation.

Review packet:

- scope reviewed;
- intended behavior and design source;
- owning subsystem and module when implementation-design exists;
- diff or artifact paths;
- validation already run;
- findings and residual risks.

Handoff packet:

- current phase;
- changed files;
- exact commands and results;
- unresolved questions;
- next checkpoint.

## Council Handling

Council is not majority vote. Use one synthesizer over multiple independent
positions. Preserve evidence quality, minority concerns, and the final decision
owner. Do not use council for routine disagreement, style preference, or missing
basic context.
