---
name: review-packet-gate
description: Use when preparing or judging review packets, gate decisions, re-review evidence, finding disposition, or readiness of a plan or implementation.
---

# Review Packet Gate

Review from evidence. A finding is valid only when it cites the changed
artifact, source path, design source, or command output that proves the risk.

## Packet

Require:

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

- resolved with evidence;
- still open;
- superseded by a different fix or requirement;
- deferred with owner and reason;
- false positive with evidence.

Then review the new diff introduced by the fix. Fixes can introduce new risks.

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

The same digest, exact rules, scope, dimensions, and target identity go to the
reviewer and verifier. Discovery may add a target-derived relation, but it may
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
